from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_alter_permissionmodule_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="telegram_chat_id",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]

