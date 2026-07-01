from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import InternalKeyAuthentication
from .serializers import FreeSlotsRequestSerializer
from .services import compute_free_slots, fetch_busy_intervals


class FreeSlotsView(APIView):
    """POST /api/free-slots/

    Recibe el access token de Google del usuario (ya refrescado por
    Next.js) y devuelve, día por día, los bloques libres dentro del
    horario laboral indicado.
    """

    authentication_classes = [InternalKeyAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = FreeSlotsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        working_hours = data.get("working_hours") or {"start": "09:00", "end": "19:00"}

        busy_intervals = fetch_busy_intervals(
            access_token=data["access_token"],
            time_min=data["time_min"],
            time_max=data["time_max"],
        )

        for extra in data.get("extra_busy") or []:
            busy_intervals.append((extra["start"], extra["end"]))

        days = compute_free_slots(
            busy_intervals=busy_intervals,
            time_min=data["time_min"],
            time_max=data["time_max"],
            tz_name=data["timezone"],
            working_hours=working_hours,
            working_hours_by_weekday=data.get("working_hours_by_weekday"),
        )

        return Response({"days": days})
