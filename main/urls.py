from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.main, name='main'),
    path('<str:project_title>/', views.ProjectDetail, name='project_detail')
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += staticfiles_urlpatterns()