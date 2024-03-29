# Generated by Django 5.0.1 on 2024-01-23 04:43

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0002_rename_title_project_comment_project_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Career",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("company", models.CharField(max_length=128, verbose_name="회사")),
                ("position", models.CharField(max_length=128, verbose_name="직책")),
                ("content", models.TextField(verbose_name="업무")),
                ("join_date", models.DateField(verbose_name="입사일")),
                ("leave_date", models.DateField(verbose_name="퇴사일")),
            ],
        ),
    ]
