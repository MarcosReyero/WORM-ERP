from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0017_pallet_type_nullable_article_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="pallet",
            name="pallet_lot",
            field=models.CharField(blank=True, max_length=4),
        ),
    ]

