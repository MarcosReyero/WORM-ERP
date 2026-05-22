from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0019_person_remove_legacy_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="article",
            name="auto_purchase_request",
            field=models.BooleanField(default=False),
        ),
    ]
