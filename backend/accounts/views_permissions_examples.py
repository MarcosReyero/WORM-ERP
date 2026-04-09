"""
Ejemplos de uso del sistema de permisos integrado en vistas API.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import (
    has_module_permission,
    get_user_accessible_modules,
    has_sector_permission,
    get_user_accessible_sectors,
    permission_required,
)
from inventory.models import Sector, Article


# =========== EJEMPLO 1: Endpoint de información de permisos ===========

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_permissions(request):
    """
    Retorna todos los permisos accesibles del usuario actual.
    
    Uso: GET /api/permisos/
    """
    user = request.user
    
    if not user.is_active:
        return Response(
            {'error': 'Usuario inactivo'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    modules = get_user_accessible_modules(user)
    sectors = get_user_accessible_sectors(user)
    
    return Response({
        'user': user.username,
        'is_admin': user.is_staff,
        'role': user.profile.get_role_display() if hasattr(user, 'profile') else None,
        'modules': modules,
        'sectors': [
            {
                'id': s.id,
                'name': s.name,
                'permisos': {
                    'view': has_sector_permission(user, s, 'view'),
                    'edit': has_sector_permission(user, s, 'edit'),
                    'delete': has_sector_permission(user, s, 'delete'),
                }
            }
            for s in sectors
        ]
    })


# =========== EJEMPLO 2: Proteger endpoint con decorador ===========

@api_view(['GET'])
@permission_required('inventory_overview', 'view')
def inventory_dashboard(request):
    """
    Solo accesible si el usuario tiene permiso 'view' en 'inventory_overview'
    """
    return Response({
        'message': 'Bienvenido al panel de inventario',
        'user': request.user.username
    })


# =========== EJEMPLO 3: Verificación manual en vista ===========

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_movement(request):
    """
    Crear un movimiento de inventario.
    Requiere permisos de 'create' en 'movements'
    """
    # Verificar permiso
    if not has_module_permission(request.user, 'movements', 'create'):
        return Response(
            {'error': 'No tienes permiso para crear movimientos'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Lógica para crear movimiento...
    return Response({
        'message': 'Movimiento creado exitosamente',
        'user': request.user.username
    })


# =========== EJEMPLO 4: Control de acceso por sector ===========

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_article(request, article_id):
    """
    Editar un artículo.
    Requiere:
    1. Permiso de 'change' en 'stock_management'
    2. Permiso de 'edit' en el sector responsable del artículo
    """
    # Verificar permiso del módulo
    if not has_module_permission(request.user, 'stock_management', 'change'):
        return Response(
            {'error': 'No tienes permiso para editar stock'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Obtener artículo
    try:
        article = Article.objects.get(pk=article_id)
    except Article.DoesNotExist:
        return Response(
            {'error': 'Artículo no encontrado'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Verificar permiso del sector
    if not has_sector_permission(request.user, article.sector_responsible, 'edit'):
        return Response(
            {'error': 'No tienes permiso para editar en este sector'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Updatear artículo...
    return Response({
        'message': 'Artículo actualizado exitosamente',
        'article': article.internal_code
    })


# =========== EJEMPLO 5: Listar solo lo que el usuario puede ver ===========

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_articles(request):
    """
    Listar artículos accesibles para el usuario.
    Solo muestra artículos de sectores en los que tiene permisos.
    """
    # Verificar acceso al módulo
    if not has_module_permission(request.user, 'stock_management', 'view'):
        return Response(
            {'error': 'No tienes permiso para ver el stock'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Obtener sectores accesibles
    accessible_sectors = get_user_accessible_sectors(request.user)
    
    # Filtrar artículos por sectores accesibles
    articles = Article.objects.filter(
        sector_responsible__in=accessible_sectors
    ).values('id', 'internal_code', 'name', 'sector_responsible__name')
    
    return Response({
        'count': articles.count(),
        'articles': list(articles),
        'accessible_sectors': list(accessible_sectors.values_list('name', flat=True))
    })


# =========== EJEMPLO 6: Lógica condicional en frontend ===========

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_ui_config(request):
    """
    Retorna configuración de UI basada en permisos del usuario.
    Usa esto para mostrar/ocultar botones, menús, etc. en el frontend.
    """
    user = request.user
    
    return Response({
        'menu': {
            'inventory': has_module_permission(user, 'inventory_overview', 'view'),
            'stock': {
                'show': has_module_permission(user, 'stock_management', 'view'),
                'can_create': has_module_permission(user, 'stock_management', 'create'),
                'can_edit': has_module_permission(user, 'stock_management', 'change'),
                'can_delete': has_module_permission(user, 'stock_management', 'delete'),
            },
            'movements': {
                'show': has_module_permission(user, 'movements', 'view'),
                'can_create': has_module_permission(user, 'movements', 'create'),
            },
            'reports': has_module_permission(user, 'reports', 'view'),
            'admin': has_module_permission(user, 'admin_users', 'view'),
        },
        'actions': {
            'can_export': has_module_permission(user, 'reports', 'export'),
            'can_approve': has_module_permission(user, 'movements', 'approve'),
        }
    })


# =========== EJEMPLO 7: Query filtrado por permisos ===========

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_counts_list(request):
    """
    Listar conteos según permisos del usuario.
    """
    if not has_module_permission(request.user, 'counts', 'view'):
        return Response(
            {'error': 'No tienes permiso para ver conteos'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Si tiene permisos, retornar lista
    # Bonus: además filtrar solo por sectores accesibles
    
    accessible_sectors = get_user_accessible_sectors(request.user)
    
    from inventory.models import InventoryCount  # Import ficticio para ejemplo
    
    counts = [
        {
            'id': 1,
            'sector': 'Electrónica',
            'created_at': '2026-04-08',
            'user': 'Carlos',
        }
        # ... filtrado por accessible_sectors
    ]
    
    return Response({
        'count': len(counts),
        'results': counts,
        'can_create': has_module_permission(request.user, 'counts', 'create'),
        'can_edit': has_module_permission(request.user, 'counts', 'change'),
    })


# =========== URLS necesarias para los ejemplos ===========

"""
# Agregar a accounts/urls.py o crear new file:

from django.urls import path
from . import views_permissions

urlpatterns = [
    path('api/permisos/', views_permissions.get_user_permissions, name='user_permissions'),
    path('api/inventory/dashboard/', views_permissions.inventory_dashboard, name='dashboard'),
    path('api/movements/create/', views_permissions.create_movement, name='create_movement'),
    path('api/articles/<int:article_id>/update/', views_permissions.update_article, name='update_article'),
    path('api/articles/', views_permissions.list_articles, name='list_articles'),
    path('api/ui-config/', views_permissions.get_ui_config, name='ui_config'),
    path('api/counts/', views_permissions.get_counts_list, name='counts_list'),
]
"""
