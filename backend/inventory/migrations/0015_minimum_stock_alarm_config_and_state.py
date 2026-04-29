from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0014_remove_safetystockalertrule_last_telegram_error_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="MinimumStockAlarmConfig",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="inventory_minimumstockalarmconfig_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="inventory_minimumstockalarmconfig_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "key",
                    models.CharField(
                        default="purchasing_default",
                        max_length=32,
                        unique=True,
                    ),
                ),
                ("is_enabled", models.BooleanField(default=True)),
                ("additional_emails", models.TextField(blank=True)),
                ("notify_email", models.BooleanField(default=True)),
                ("notify_telegram", models.BooleanField(default=False)),
                ("notes", models.TextField(blank=True)),
                ("last_notified_at", models.DateTimeField(blank=True, null=True)),
                ("last_email_error", models.TextField(blank=True)),
                ("last_telegram_error", models.TextField(blank=True)),
            ],
            options={
                "verbose_name": "Alarma global por stock minimo",
                "verbose_name_plural": "Alarmas globales por stock minimo",
                "ordering": ["key"],
            },
        ),
        migrations.CreateModel(
            name="MinimumStockAlarmState",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="inventory_minimumstockalarmstate_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="inventory_minimumstockalarmstate_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("monitoring", "En monitoreo"), ("triggered", "Activada")],
                        default="monitoring",
                        max_length=16,
                    ),
                ),
                (
                    "last_stock_value",
                    models.DecimalField(
                        blank=True,
                        decimal_places=3,
                        max_digits=12,
                        null=True,
                    ),
                ),
                ("triggered_at", models.DateTimeField(blank=True, null=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("last_notified_at", models.DateTimeField(blank=True, null=True)),
                ("last_email_error", models.TextField(blank=True)),
                ("last_telegram_error", models.TextField(blank=True)),
                (
                    "article",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="minimum_stock_alarm_state",
                        to="inventory.article",
                    ),
                ),
            ],
            options={
                "verbose_name": "Estado alarma stock minimo",
                "verbose_name_plural": "Estados alarmas stock minimo",
                "ordering": ["article__name"],
            },
        ),
        migrations.AddField(
            model_name="minimumstockalarmconfig",
            name="recipients",
            field=models.ManyToManyField(
                blank=True,
                related_name="minimum_stock_alarm_configs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
