from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.core.cache import cache, caches
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
import json
from datetime import date

from .models import Career, DocsAccessRule, NavLink, Stratagem_Hero_Score
from .docs_views import (
    DOCS_EDIT_PERMISSION_CODE,
    DOCS_EDITOR_GROUP_NAME,
    DOCS_PUBLIC_WRITE_GROUP_NAME,
    get_docs_public_write_group,
    is_docs_editor,
)
from .views import (
    build_lang_switch_url,
    has_excessive_korean_text,
    render_markdown_safely,
    render_markdown_with_raw_html,
    resolve_ui_lang,
    should_return_github_link,
)


class MarkdownSafetyTests(TestCase):
    def test_render_markdown_escapes_raw_html(self):
        rendered = render_markdown_safely("<script>alert(1)</script> **bold**")
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", rendered)
        self.assertNotIn("<script>", rendered)
        self.assertIn("<strong>bold</strong>", rendered)

    def test_render_markdown_with_raw_html_keeps_html(self):
        rendered = render_markdown_with_raw_html('<div class="embed">ok</div> **bold**')
        self.assertIn('<div class="embed">ok</div>', rendered)
        self.assertIn("<strong>bold</strong>", rendered)


class AddScoreViewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.url = reverse("main:add_score")

    def post_json(self, payload):
        return self.client.post(
            self.url,
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_add_score_accepts_valid_payload(self):
        response = self.post_json({"name": "Tester_01", "score": 12.34})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Stratagem_Hero_Score.objects.count(), 1)
        self.assertEqual(Stratagem_Hero_Score.objects.first().name, "Tester_01")

    def test_add_score_rejects_invalid_name(self):
        response = self.post_json({"name": "<script>", "score": 10})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Stratagem_Hero_Score.objects.count(), 0)

    def test_add_score_rejects_out_of_range_score(self):
        response = self.post_json({"name": "player", "score": -1})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Stratagem_Hero_Score.objects.count(), 0)

    def test_add_score_rate_limits_after_threshold(self):
        for _ in range(20):
            response = self.post_json({"name": "player", "score": 11})
            self.assertEqual(response.status_code, 200)

        limited = self.post_json({"name": "player", "score": 11})
        self.assertEqual(limited.status_code, 429)


@override_settings(
    GLOBAL_RATE_LIMIT_ENABLED=True,
    GLOBAL_RATE_LIMIT_REQUESTS=2,
    GLOBAL_RATE_LIMIT_WINDOW_SECONDS=60,
    GLOBAL_RATE_LIMIT_EXEMPT_PATH_PREFIXES=("/static/", "/media/"),
)
class GlobalRateLimitMiddlewareTests(TestCase):
    def setUp(self):
        cache.clear()
        caches[getattr(settings, "GLOBAL_RATE_LIMIT_CACHE_ALIAS", "rate_limit")].clear()

    def test_rate_limit_is_applied_site_wide_across_different_paths(self):
        first = self.client.get("/ko/portfolio/")
        second = self.client.get("/ko/docs/")
        third = self.client.get("/ko/portfolio/")

        self.assertNotEqual(first.status_code, 429)
        self.assertNotEqual(second.status_code, 429)
        self.assertEqual(third.status_code, 429)
        self.assertIn("Retry-After", third)

    def test_json_requests_receive_json_429_response(self):
        self.client.get("/ko/portfolio/", HTTP_ACCEPT="application/json")
        self.client.get("/ko/portfolio/", HTTP_ACCEPT="application/json")
        limited = self.client.get("/ko/portfolio/", HTTP_ACCEPT="application/json")

        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.json(), {"error": "Too many requests. Try again later."})

    def test_exempt_paths_do_not_consume_rate_limit_quota(self):
        for _ in range(5):
            self.client.get("/static/does-not-exist.js")

        first = self.client.get("/ko/portfolio/")
        second = self.client.get("/ko/portfolio/")

        self.assertNotEqual(first.status_code, 429)
        self.assertNotEqual(second.status_code, 429)


class CareerPeriodCalculationTests(TestCase):
    def test_calculates_period_from_join_and_leave_dates(self):
        career = Career(
            company="Test",
            position="Dev",
            content="Work",
            join_date=date(2024, 3, 4),
            leave_date=date(2026, 2, 25),
        )

        self.assertEqual(career.display_period, "1년 11개월 21일")
        self.assertEqual(career.display_period_en, "1y 11m 21d")
        self.assertEqual(career.display_period_rounded, "2년")
        self.assertEqual(career.display_period_en_rounded, "2 year")

    def test_open_ended_leave_date_is_treated_as_current(self):
        career = Career(
            company="Test",
            position="Dev",
            content="Work",
            join_date=date(2024, 3, 4),
            leave_date=None,
        )

        self.assertTrue(career.is_currently_employed)
        self.assertEqual(career.effective_leave_date, timezone.localdate())
        self.assertIn("년", career.display_period)

    def test_rounding_does_not_increase_month_when_days_below_half(self):
        career = Career(
            company="Test",
            position="Dev",
            content="Work",
            join_date=date(2024, 3, 4),
            leave_date=date(2024, 4, 10),
        )

        self.assertEqual(career.display_period, "1개월 6일")
        self.assertEqual(career.display_period_rounded, "1개월")


class ChatLanguageHelperTests(TestCase):
    def test_detects_korean_drift_for_english_mode(self):
        korean_text = "안녕하세요. 포트폴리오 프로젝트 경험에 대해 안내해드릴게요."
        english_text = "Hello. I can help explain the portfolio projects."

        self.assertTrue(has_excessive_korean_text(korean_text))
        self.assertFalse(has_excessive_korean_text(english_text))

    def test_github_hint_keyword_works_for_english(self):
        self.assertTrue(should_return_github_link("Can you explain your code design style?"))


class LanguageUrlRoutingTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_localized_portfolio_page_uses_english_context(self):
        response = self.client.get("/en/portfolio/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'lang="en"', html=False)
        self.assertContains(response, 'href="/ko/portfolio/"', html=False)
        self.assertContains(response, 'href="/en/portfolio/"', html=False)

    def test_build_lang_switch_url_replaces_existing_lang_prefix(self):
        request = self.factory.get("/ko/project/1/?tab=info")
        request.session = {}

        switched = build_lang_switch_url(request, "en")

        self.assertEqual(switched, "/en/project/1/?tab=info")

    def test_resolve_ui_lang_prefers_url_lang_over_query_parameter(self):
        request = self.factory.get("/en/portfolio/?lang=ko")
        request.session = {}

        resolved = resolve_ui_lang(request, "en")

        self.assertEqual(resolved, "en")

    def test_legacy_portfolio_redirects_by_browser_language(self):
        response = self.client.get("/portfolio/?tab=projects", HTTP_ACCEPT_LANGUAGE="en-US,en;q=0.9")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/en/portfolio/?tab=projects")

    def test_legacy_portfolio_redirects_to_ko_when_accept_language_missing(self):
        response = self.client.get("/portfolio/", HTTP_ACCEPT_LANGUAGE="")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/ko/portfolio/")

    def test_legacy_portfolio_redirects_to_en_for_non_korean_language(self):
        response = self.client.get("/portfolio/", HTTP_ACCEPT_LANGUAGE="ja-JP,ja;q=0.9")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/en/portfolio/")


class DocsEditorPermissionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user_model = get_user_model()
        self.docs_editor_group, _ = Group.objects.get_or_create(name=DOCS_EDITOR_GROUP_NAME)
        content_type = ContentType.objects.get_for_model(NavLink)
        self.docs_permission, _ = Permission.objects.get_or_create(
            content_type=content_type,
            codename=DOCS_EDIT_PERMISSION_CODE.split(".", 1)[1],
            defaults={"name": "Can edit docs content"},
        )
        self.docs_editor_group.permissions.set([self.docs_permission])

    def test_docs_editor_group_user_is_allowed(self):
        user = self.user_model.objects.create_user(username="docs_editor", password="pw123456")
        user.groups.add(self.docs_editor_group)
        request = self.factory.get("/ko/docs/list/")
        request.user = user

        self.assertTrue(is_docs_editor(request))

    def test_regular_user_is_denied_for_write_api(self):
        user = self.user_model.objects.create_user(username="regular_user", password="pw123456")
        self.client.force_login(user)

        response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "", "folder_name": "tmp"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_docs_editor_group_user_passes_auth_gate_for_write_api(self):
        user = self.user_model.objects.create_user(username="docs_editor2", password="pw123456")
        user.groups.add(self.docs_editor_group)
        self.client.force_login(user)

        response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "__missing__", "folder_name": "tmp"}),
            content_type="application/json",
        )

        self.assertNotEqual(response.status_code, 403)


class DocsAuthFlowTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username="docs_login_user",
            password="pw123456",
            is_staff=False,
        )

    def test_docs_login_page_is_accessible(self):
        response = self.client.get("/ko/docs/login/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Docs 로그인")

    def test_docs_login_authenticates_non_staff_user(self):
        response = self.client.post(
            "/ko/docs/login/",
            data={"username": "docs_login_user", "password": "pw123456", "next": "/ko/docs/list/"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/ko/docs/list/")
        self.assertTrue("_auth_user_id" in self.client.session)

    def test_docs_logout_clears_session(self):
        self.client.force_login(self.user)

        response = self.client.post(
            "/ko/docs/logout/",
            data={"next": "/ko/docs/list/"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/ko/docs/list/")
        self.assertFalse("_auth_user_id" in self.client.session)

    def test_docs_logout_csrf_failure_redirects_to_docs_root(self):
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.user)

        response = csrf_client.post(
            "/ko/docs/logout/",
            data={"next": "/ko/docs/list/"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("main:docs_root_lang", kwargs={"ui_lang": "ko"}))


class DocsAccessRuleTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.override_settings = override_settings(MEDIA_ROOT=self.temp_dir.name)
        self.override_settings.enable()
        self.addCleanup(self.override_settings.disable)
        self.addCleanup(self.temp_dir.cleanup)

        self.user_model = get_user_model()
        self.docs_editor_group, _ = Group.objects.get_or_create(name=DOCS_EDITOR_GROUP_NAME)
        content_type = ContentType.objects.get_for_model(NavLink)
        self.docs_permission, _ = Permission.objects.get_or_create(
            content_type=content_type,
            codename=DOCS_EDIT_PERMISSION_CODE.split(".", 1)[1],
            defaults={"name": "Can edit docs content"},
        )
        self.docs_editor_group.permissions.set([self.docs_permission])

        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "restricted").mkdir(parents=True, exist_ok=True)
        (docs_root / "restricted" / "secret.md").write_text("# secret", encoding="utf-8")
        (docs_root / "public.md").write_text("# public", encoding="utf-8")

    def create_docs_editor(self, username):
        user = self.user_model.objects.create_user(username=username, password="pw123456")
        user.groups.add(self.docs_editor_group)
        return user

    def test_restricted_path_blocks_non_allowed_user_from_read(self):
        reader_group = Group.objects.create(name="docs_readers")
        rule = DocsAccessRule.objects.create(path="restricted")
        rule.read_groups.add(reader_group)

        blocked_user = self.user_model.objects.create_user(username="blocked", password="pw123456")
        self.client.force_login(blocked_user)
        blocked_response = self.client.get("/ko/docs/restricted/secret/")
        self.assertEqual(blocked_response.status_code, 403)

        blocked_user.groups.add(reader_group)
        allowed_response = self.client.get("/ko/docs/restricted/secret/")
        self.assertEqual(allowed_response.status_code, 200)

    def test_restricted_path_blocks_docs_editor_write_when_not_in_acl(self):
        writers_group = Group.objects.create(name="docs_writers")
        rule = DocsAccessRule.objects.create(path="restricted")
        rule.write_groups.add(writers_group)

        blocked_editor = self.create_docs_editor("blocked_editor")
        allowed_editor = self.create_docs_editor("allowed_editor")
        allowed_editor.groups.add(writers_group)

        self.client.force_login(blocked_editor)
        blocked = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "restricted", "folder_name": "new_folder"}),
            content_type="application/json",
        )
        self.assertEqual(blocked.status_code, 403)

        self.client.force_login(allowed_editor)
        allowed = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "restricted", "folder_name": "new_folder"}),
            content_type="application/json",
        )
        self.assertEqual(allowed.status_code, 200)

    def test_child_file_write_acl_does_not_grant_parent_directory_write(self):
        writers_group = Group.objects.create(name="child_file_writers")
        rule = DocsAccessRule.objects.create(path="restricted/secret.md")
        rule.write_groups.add(writers_group)

        allowed_editor = self.create_docs_editor("child_file_acl_editor")
        allowed_editor.groups.add(writers_group)
        self.client.force_login(allowed_editor)

        parent_write_response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "restricted", "folder_name": "should_block"}),
            content_type="application/json",
        )
        self.assertEqual(parent_write_response.status_code, 403)

        edit_page_response = self.client.get("/ko/docs/write/", data={"path": "restricted/secret.md"})
        self.assertEqual(edit_page_response.status_code, 200)

    def test_child_file_write_acl_does_not_grant_root_directory_write(self):
        writers_group = Group.objects.create(name="root_parent_block_writers")
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(writers_group)

        allowed_editor = self.create_docs_editor("root_parent_block_editor")
        allowed_editor.groups.add(writers_group)
        self.client.force_login(allowed_editor)

        root_write_response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "", "folder_name": "root_should_block"}),
            content_type="application/json",
        )
        self.assertEqual(root_write_response.status_code, 403)

        edit_page_response = self.client.get("/ko/docs/write/", data={"path": "public.md"})
        self.assertEqual(edit_page_response.status_code, 200)

    def test_inherited_root_write_acl_is_blocked_when_child_acl_exists(self):
        root_rule = DocsAccessRule.objects.create(path="")
        root_rule.write_groups.add(self.docs_editor_group)

        child_writers = Group.objects.create(name="child_override_writers")
        child_rule = DocsAccessRule.objects.create(path="restricted/secret.md")
        child_rule.write_groups.add(child_writers)

        editor = self.create_docs_editor("root_inherited_editor")
        self.client.force_login(editor)

        blocked_response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "restricted", "folder_name": "blocked_by_child_acl"}),
            content_type="application/json",
        )
        self.assertEqual(blocked_response.status_code, 403)

        root_allowed_response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "", "folder_name": "root_still_allowed"}),
            content_type="application/json",
        )
        self.assertEqual(root_allowed_response.status_code, 200)

    def test_write_only_rule_on_folder_does_not_block_read_access(self):
        writers_group = Group.objects.create(name="restricted_writers")
        rule = DocsAccessRule.objects.create(path="restricted")
        rule.write_groups.add(writers_group)

        anonymous_list = self.client.get("/ko/docs/restricted/list/")
        anonymous_doc = self.client.get("/ko/docs/restricted/secret/")
        api_list = self.client.get(reverse("main:docs_api_list"), data={"path": "restricted"})

        self.assertEqual(anonymous_list.status_code, 200)
        self.assertEqual(anonymous_doc.status_code, 200)
        self.assertEqual(api_list.status_code, 200)

    def test_docs_api_move_moves_file_into_target_directory(self):
        editor = self.create_docs_editor("move_editor")
        self.client.force_login(editor)

        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "archive").mkdir(parents=True, exist_ok=True)

        response = self.client.post(
            reverse("main:docs_api_move"),
            data=json.dumps({"source_path": "public.md", "target_dir": "archive"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse((docs_root / "public.md").exists())
        self.assertTrue((docs_root / "archive" / "public.md").exists())
        self.assertEqual(response.json().get("path"), "archive/public.md")

    def test_docs_api_move_blocks_folder_move_into_descendant(self):
        editor = self.create_docs_editor("move_descendant_editor")
        self.client.force_login(editor)

        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "restricted" / "child").mkdir(parents=True, exist_ok=True)

        response = self.client.post(
            reverse("main:docs_api_move"),
            data=json.dumps({"source_path": "restricted", "target_dir": "restricted/child"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue((docs_root / "restricted").exists())
        self.assertTrue((docs_root / "restricted" / "child").exists())

    def test_docs_api_move_requires_write_access_on_target_directory(self):
        writers_group = Group.objects.create(name="archive_writers")
        rule = DocsAccessRule.objects.create(path="archive")
        rule.write_groups.add(writers_group)

        blocked_editor = self.create_docs_editor("blocked_move_editor")
        allowed_editor = self.create_docs_editor("allowed_move_editor")
        allowed_editor.groups.add(writers_group)

        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "archive").mkdir(parents=True, exist_ok=True)

        self.client.force_login(blocked_editor)
        blocked_response = self.client.post(
            reverse("main:docs_api_move"),
            data=json.dumps({"source_path": "public.md", "target_dir": "archive"}),
            content_type="application/json",
        )
        self.assertEqual(blocked_response.status_code, 403)

        self.client.force_login(allowed_editor)
        allowed_response = self.client.post(
            reverse("main:docs_api_move"),
            data=json.dumps({"source_path": "public.md", "target_dir": "archive"}),
            content_type="application/json",
        )
        self.assertEqual(allowed_response.status_code, 200)
        self.assertFalse((docs_root / "public.md").exists())
        self.assertTrue((docs_root / "archive" / "public.md").exists())

    def test_acl_api_is_admin_only(self):
        editor = self.create_docs_editor("acl_editor")
        target_group = Group.objects.create(name="target_group")
        target_user = self.user_model.objects.create_user(username="target_user", password="pw123456")

        self.client.force_login(editor)
        response = self.client.post(
            reverse("main:docs_api_acl"),
            data=json.dumps(
                {
                    "path": "restricted/secret.md",
                    "read_user_ids": [target_user.id],
                    "read_group_ids": [target_group.id],
                    "write_user_ids": [target_user.id],
                    "write_group_ids": [target_group.id],
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_acl_api_can_save_and_clear_split_rule(self):
        admin_user = self.user_model.objects.create_user(
            username="acl_admin",
            password="pw123456",
            is_staff=True,
        )
        read_group = Group.objects.create(name="read_group")
        write_group = Group.objects.create(name="write_group")
        read_user = self.user_model.objects.create_user(username="read_user", password="pw123456")
        write_user = self.user_model.objects.create_user(username="write_user", password="pw123456")

        self.client.force_login(admin_user)
        response = self.client.post(
            reverse("main:docs_api_acl"),
            data=json.dumps(
                {
                    "path": "restricted/secret.md",
                    "read_user_ids": [read_user.id],
                    "read_group_ids": [read_group.id],
                    "write_user_ids": [write_user.id],
                    "write_group_ids": [write_group.id],
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        rule = DocsAccessRule.objects.get(path="restricted/secret.md")
        self.assertEqual(set(rule.read_users.values_list("id", flat=True)), {read_user.id})
        self.assertEqual(set(rule.read_groups.values_list("id", flat=True)), {read_group.id})
        self.assertEqual(set(rule.write_users.values_list("id", flat=True)), {write_user.id})
        self.assertEqual(set(rule.write_groups.values_list("id", flat=True)), {write_group.id})

        clear_response = self.client.post(
            reverse("main:docs_api_acl"),
            data=json.dumps(
                {
                    "path": "restricted/secret.md",
                    "read_user_ids": [],
                    "read_group_ids": [],
                    "write_user_ids": [],
                    "write_group_ids": [],
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(clear_response.status_code, 200)
        self.assertFalse(DocsAccessRule.objects.filter(path="restricted/secret.md").exists())

    def test_acl_options_includes_public_all_group(self):
        admin_user = self.user_model.objects.create_user(
            username="acl_admin_options",
            password="pw123456",
            is_staff=True,
        )
        self.client.force_login(admin_user)

        response = self.client.get(reverse("main:docs_api_acl_options"))
        self.assertEqual(response.status_code, 200)

        groups = response.json().get("groups", [])
        self.assertTrue(any(group.get("name") == DOCS_PUBLIC_WRITE_GROUP_NAME for group in groups))
        self.assertTrue(any(group.get("label") == "전체" for group in groups))

    def test_anonymous_user_cannot_write_directory_when_public_all_group_is_set(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="")
        rule.write_groups.add(public_group)

        response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "", "folder_name": "anon_public_write"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        self.assertFalse((docs_root / "anon_public_write").exists())

    def test_acl_api_rejects_public_all_group_for_directory(self):
        admin_user = self.user_model.objects.create_user(
            username="acl_admin_block_dir_public",
            password="pw123456",
            is_staff=True,
        )
        public_group = get_docs_public_write_group()
        self.client.force_login(admin_user)

        response = self.client.post(
            reverse("main:docs_api_acl"),
            data=json.dumps(
                {
                    "path": "restricted",
                    "read_user_ids": [],
                    "read_group_ids": [],
                    "write_user_ids": [],
                    "write_group_ids": [public_group.id],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("폴더에는 전체 권한을 설정할 수 없습니다", response.json().get("error", ""))

    def test_legacy_directory_public_all_rule_does_not_grant_write_access(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="restricted")
        rule.write_groups.add(public_group)

        editor = self.create_docs_editor("legacy_dir_public_editor")
        self.client.force_login(editor)

        response = self.client.post(
            reverse("main:docs_api_mkdir"),
            data=json.dumps({"parent_dir": "restricted", "folder_name": "should_not_create"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_docs_api_list_marks_public_writable_file(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.get(reverse("main:docs_api_list"), data={"path": ""})
        self.assertEqual(response.status_code, 200)

        entries = response.json().get("entries", [])
        public_entry = next((entry for entry in entries if entry.get("path") == "public.md"), None)
        self.assertIsNotNone(public_entry)
        self.assertTrue(public_entry.get("can_edit"))
        self.assertTrue(public_entry.get("is_public_write"))
        self.assertEqual(public_entry.get("write_acl_labels"), [])

    def test_docs_api_list_includes_write_acl_labels_for_accounts_and_groups(self):
        writer_group = Group.objects.create(name="writers_group")
        writer_user = self.user_model.objects.create_user(username="writer_user", password="pw123456")
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(writer_group)
        rule.write_users.add(writer_user)

        admin_user = self.user_model.objects.create_user(
            username="acl_admin_reader",
            password="pw123456",
            is_staff=True,
        )
        self.client.force_login(admin_user)

        response = self.client.get(reverse("main:docs_api_list"), data={"path": ""})
        self.assertEqual(response.status_code, 200)
        entries = response.json().get("entries", [])
        public_entry = next((entry for entry in entries if entry.get("path") == "public.md"), None)
        self.assertIsNotNone(public_entry)
        labels = public_entry.get("write_acl_labels") or []
        self.assertIn("#writers_group", labels)
        self.assertIn("@writer_user", labels)

    def test_docs_write_page_allows_anonymous_public_writable_file_edit(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.get("/ko/docs/write/", data={"path": "public.md"})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-public-write-direct-save="1"')

    def test_docs_api_preview_rejects_user_without_write_permission(self):
        user = self.user_model.objects.create_user(username="preview_blocked", password="pw123456")
        self.client.force_login(user)

        response = self.client.post(
            reverse("main:docs_api_preview"),
            data=json.dumps({"original_path": "", "content": "# blocked"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_docs_api_preview_allows_anonymous_for_public_writable_file(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.post(
            reverse("main:docs_api_preview"),
            data=json.dumps({"original_path": "public.md", "content": "# 제목"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload.get("ok"))
        self.assertIn("<h1>", payload.get("html", ""))

    def test_docs_view_shows_edit_button_for_anonymous_public_writable_file(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.get("/ko/docs/public/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "/ko/docs/write")
        self.assertContains(response, "path=public.md")

    def test_public_writable_file_cannot_be_renamed(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.post(
            reverse("main:docs_api_rename"),
            data=json.dumps({"path": "public.md", "new_name": "public_renamed"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("전체 허용 파일은 이름을 바꿀 수 없습니다", response.json().get("error", ""))
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        self.assertTrue((docs_root / "public.md").exists())
        self.assertFalse((docs_root / "public_renamed.md").exists())

    def test_public_writable_file_cannot_be_deleted(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.post(
            reverse("main:docs_api_delete"),
            data=json.dumps({"path": "public.md"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("전체 허용 파일은 삭제할 수 없습니다", response.json().get("error", ""))
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        self.assertTrue((docs_root / "public.md").exists())

    def test_public_writable_file_cannot_be_moved(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "archive").mkdir(parents=True, exist_ok=True)

        response = self.client.post(
            reverse("main:docs_api_move"),
            data=json.dumps({"source_path": "public.md", "target_dir": "archive"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("전체 허용 파일은 이동할 수 없습니다", response.json().get("error", ""))
        self.assertTrue((docs_root / "public.md").exists())
        self.assertFalse((docs_root / "archive" / "public.md").exists())

    def test_public_writable_file_save_api_rejects_rename(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)

        response = self.client.post(
            reverse("main:docs_api_save"),
            data=json.dumps(
                {
                    "original_path": "public.md",
                    "target_dir": "",
                    "filename": "public_renamed",
                    "content": "# renamed",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("전체 허용 파일은 위치나 이름을 바꿀 수 없습니다", response.json().get("error", ""))
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        self.assertTrue((docs_root / "public.md").exists())
        self.assertFalse((docs_root / "public_renamed.md").exists())

    def test_public_writable_file_save_api_rejects_move(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)
        docs_root = Path(settings.MEDIA_ROOT) / "docs"
        (docs_root / "archive").mkdir(parents=True, exist_ok=True)

        response = self.client.post(
            reverse("main:docs_api_save"),
            data=json.dumps(
                {
                    "original_path": "public.md",
                    "target_dir": "archive",
                    "filename": "public",
                    "content": "# moved",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("전체 허용 파일은 위치나 이름을 바꿀 수 없습니다", response.json().get("error", ""))
        self.assertTrue((docs_root / "public.md").exists())
        self.assertFalse((docs_root / "archive" / "public.md").exists())

    def test_public_writable_file_save_api_allows_same_path_update(self):
        public_group = get_docs_public_write_group()
        rule = DocsAccessRule.objects.create(path="public.md")
        rule.write_groups.add(public_group)
        docs_root = Path(settings.MEDIA_ROOT) / "docs"

        response = self.client.post(
            reverse("main:docs_api_save"),
            data=json.dumps(
                {
                    "original_path": "public.md",
                    "target_dir": "",
                    "filename": "public",
                    "content": "# updated",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual((docs_root / "public.md").read_text(encoding="utf-8"), "# updated")
