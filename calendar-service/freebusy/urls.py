from django.urls import path

from .views import FreeSlotsView

urlpatterns = [
    path("free-slots/", FreeSlotsView.as_view(), name="free-slots"),
]
