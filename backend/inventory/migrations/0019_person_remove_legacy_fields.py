from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0018_pallet_lot'),
    ]

    operations = [
        migrations.RemoveField(model_name='person', name='digital_signature'),
        migrations.RemoveField(model_name='person', name='employee_code'),
        migrations.RemoveField(model_name='person', name='observations'),
        migrations.RemoveField(model_name='person', name='position'),
        migrations.RemoveField(model_name='person', name='supervisor'),
        migrations.AddField(
            model_name='person',
            name='dni',
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
