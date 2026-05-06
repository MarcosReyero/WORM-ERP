from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0016_remove_safetystockalertrule_last_telegram_error_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="pallet",
            name="pallet_type",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AlterField(
            model_name="pallet",
            name="article",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="pallets",
                to="inventory.article",
            ),
        ),
        migrations.AlterField(
            model_name="pallet",
            name="quantity",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True),
        ),
    ]

