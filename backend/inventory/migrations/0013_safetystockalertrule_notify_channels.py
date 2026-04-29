from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0012_supplier_availability_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="safetystockalertrule",
            name="notify_email",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="safetystockalertrule",
            name="notify_telegram",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="safetystockalertrule",
            name="last_telegram_error",
            field=models.TextField(blank=True),
        ),
    ]

