from rest_framework import serializers


class WorkingHoursSerializer(serializers.Serializer):
    start = serializers.RegexField(r"^\d{2}:\d{2}$", default="09:00")
    end = serializers.RegexField(r"^\d{2}:\d{2}$", default="19:00")


class ExtraBusySerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()


class FreeSlotsRequestSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    time_min = serializers.DateTimeField()
    time_max = serializers.DateTimeField()
    timezone = serializers.CharField(default="America/Mexico_City")
    working_hours = WorkingHoursSerializer(required=False)
    # Horario distinto por día ISO de la semana ("1"=lunes .. "7"=domingo).
    # Si un día no viene aquí, se usa `working_hours` como respaldo.
    working_hours_by_weekday = serializers.DictField(child=WorkingHoursSerializer(), required=False)
    # Intervalos extra (tareas de Supabase sin evento de Google) que deben
    # contarse como ocupado aunque no aparezcan en el freebusy de Google.
    extra_busy = ExtraBusySerializer(many=True, required=False)

    def validate(self, attrs):
        if attrs["time_max"] <= attrs["time_min"]:
            raise serializers.ValidationError("time_max debe ser posterior a time_min")
        return attrs
