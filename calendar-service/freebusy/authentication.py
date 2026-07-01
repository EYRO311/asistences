from django.conf import settings
from rest_framework import authentication, exceptions


class InternalKeyAuthentication(authentication.BaseAuthentication):
    """Autenticación simple basada en un header compartido con Next.js.

    Se espera el header `X-Internal-Key` con el valor de INTERNAL_API_KEY.
    No representa a un usuario real (Django no tiene su propia BD de usuarios).
    """

    def authenticate(self, request):
        provided_key = request.headers.get("X-Internal-Key")

        if not settings.INTERNAL_API_KEY:
            raise exceptions.AuthenticationFailed("INTERNAL_API_KEY no está configurada en el servidor")

        if provided_key != settings.INTERNAL_API_KEY:
            raise exceptions.AuthenticationFailed("X-Internal-Key inválida")

        return (None, None)
