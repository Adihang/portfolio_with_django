from django.test import TestCase
from django.urls import reverse
from django.core.cache import cache
import json

from .models import Stratagem_Hero_Score
from .views import render_markdown_safely, render_markdown_with_raw_html


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
