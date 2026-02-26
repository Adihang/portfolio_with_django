from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.models import Permission
from django.core.management.base import BaseCommand
from django.core.management.base import CommandError

from main.docs_views import DOCS_EDITOR_GROUP_NAME, DOCS_EDIT_PERMISSION_CODE


class Command(BaseCommand):
    help = "Create or update a docs editor account (DocsEditors group)."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Login username")
        parser.add_argument("--password", required=True, help="Login password")
        parser.add_argument("--email", default="", help="Optional email")
        parser.add_argument(
            "--staff",
            action="store_true",
            help="Allow /admin login too (is_staff=True).",
        )

    def handle(self, *args, **options):
        username = options["username"].strip()
        password = options["password"]
        email = (options.get("email") or "").strip()
        allow_staff = bool(options.get("staff"))

        User = get_user_model()
        user, created = User.objects.get_or_create(username=username)

        if email:
            user.email = email
        user.is_active = True
        user.is_staff = allow_staff
        user.set_password(password)
        user.save()

        group, _ = Group.objects.get_or_create(name=DOCS_EDITOR_GROUP_NAME)
        permission = (
            Permission.objects.filter(
                content_type__app_label="main",
                codename=DOCS_EDIT_PERMISSION_CODE.split(".", 1)[1],
            )
            .select_related("content_type")
            .first()
        )
        if permission is None:
            raise CommandError(
                "Permission main.can_edit_docs was not found. Run migrations first."
            )
        group.permissions.set([permission])
        user.groups.add(group)

        state = "created" if created else "updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"Docs editor account {state}: {username} (group={DOCS_EDITOR_GROUP_NAME}, staff={user.is_staff})"
            )
        )
