from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def fetch_busy_intervals(access_token: str, time_min: datetime, time_max: datetime) -> list[tuple[datetime, datetime]]:
    """Consulta la API de Google Calendar (freebusy.query) para el calendario
    'primary' del usuario y devuelve los intervalos ocupados como tuplas
    (inicio, fin) en UTC."""

    credentials = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)

    body = {
        "timeMin": time_min.isoformat(),
        "timeMax": time_max.isoformat(),
        "items": [{"id": "primary"}],
    }

    response = service.freebusy().query(body=body).execute()
    busy_raw = response["calendars"]["primary"].get("busy", [])

    return [
        (datetime.fromisoformat(b["start"]), datetime.fromisoformat(b["end"]))
        for b in busy_raw
    ]


def compute_free_slots(
    busy_intervals: list[tuple[datetime, datetime]],
    time_min: datetime,
    time_max: datetime,
    tz_name: str,
    working_hours: dict,
    working_hours_by_weekday: dict | None = None,
) -> list[dict]:
    """Calcula, día por día entre time_min y time_max, los bloques libres
    dentro del horario laboral indicado, restando los intervalos ocupados.

    `working_hours_by_weekday` permite un horario distinto por día ISO de la
    semana ("1"=lunes .. "7"=domingo); si un día no está ahí, se usa
    `working_hours` como respaldo."""

    tz = ZoneInfo(tz_name)
    working_hours_by_weekday = working_hours_by_weekday or {}

    busy_local = [(b[0].astimezone(tz), b[1].astimezone(tz)) for b in busy_intervals]

    days = []
    current_day = time_min.astimezone(tz).date()
    # time_max suele ser la medianoche del día siguiente al último día deseado
    # (límite exclusivo). Restamos un instante para no incluir ese día extra.
    last_day = (time_max - timedelta(microseconds=1)).astimezone(tz).date()

    while current_day <= last_day:
        iso_weekday = str(current_day.isoweekday())
        day_hours = working_hours_by_weekday.get(iso_weekday, working_hours)

        start_hour, start_minute = (int(p) for p in day_hours["start"].split(":"))
        end_hour, end_minute = (int(p) for p in day_hours["end"].split(":"))

        day_start = datetime.combine(current_day, time(start_hour, start_minute), tzinfo=tz)
        day_end = datetime.combine(current_day, time(end_hour, end_minute), tzinfo=tz)

        free_blocks = _subtract_busy(day_start, day_end, busy_local)

        total_minutes = (day_end - day_start).total_seconds() / 60
        free_minutes = sum((b[1] - b[0]).total_seconds() / 60 for b in free_blocks)

        days.append(
            {
                "date": current_day.isoformat(),
                "free": free_minutes >= total_minutes,
                "free_blocks": [
                    {"start": b[0].isoformat(), "end": b[1].isoformat()} for b in free_blocks
                ],
            }
        )

        current_day += timedelta(days=1)

    return days


def _subtract_busy(
    window_start: datetime, window_end: datetime, busy_intervals: list[tuple[datetime, datetime]]
) -> list[tuple[datetime, datetime]]:
    """Resta los intervalos ocupados que se solapan con [window_start, window_end]."""

    overlapping = sorted(
        (max(b[0], window_start), min(b[1], window_end))
        for b in busy_intervals
        if b[0] < window_end and b[1] > window_start
    )

    free_blocks = []
    cursor = window_start

    for busy_start, busy_end in overlapping:
        if busy_start > cursor:
            free_blocks.append((cursor, busy_start))
        cursor = max(cursor, busy_end)

    if cursor < window_end:
        free_blocks.append((cursor, window_end))

    return free_blocks
