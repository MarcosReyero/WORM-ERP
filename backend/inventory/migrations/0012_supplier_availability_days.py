from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0011_pallet_storageposition_palletevent_pallet_position_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplier",
            name="availability_days",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Tiempo estimado de disponibilidad/entrega en días (lead time).",
                null=True,
            ),
        ),
    ]

