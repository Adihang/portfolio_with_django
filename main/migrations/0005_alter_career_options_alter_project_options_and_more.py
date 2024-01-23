# Generated by Django 5.0.1 on 2024-01-23 09:06

import main.models
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0004_career_period"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="career",
            options={"ordering": ["order"]},
        ),
        migrations.AlterModelOptions(
            name="project",
            options={"ordering": ["order"]},
        ),
        migrations.AddField(
            model_name="career",
            name="order",
            field=main.models.OrderField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="project",
            name="order",
            field=main.models.OrderField(blank=True, null=True),
        ),
    ]
