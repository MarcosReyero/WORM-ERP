from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0018_pallet_lot'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE inventory_person
                    DROP COLUMN IF EXISTS digital_signature,
                    DROP COLUMN IF EXISTS employee_code,
                    DROP COLUMN IF EXISTS observations,
                    DROP COLUMN IF EXISTS "position",
                    DROP COLUMN IF EXISTS supervisor_id;
                ALTER TABLE inventory_person
                    ADD COLUMN IF NOT EXISTS dni varchar(40) NOT NULL DEFAULT '';
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
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
            ],
            database_operations=[],
        ),
    ]
