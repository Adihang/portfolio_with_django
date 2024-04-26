from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.main, name='main'),
    path('project/<int:project_id>/', views.ProjectDetail, name='ProjectDetail'),
    path('Stratagem/', views.Stratagem, name='Stratagem'),
    path('comment/create/<int:project_id>/', views.ProjectComment_create, name='ProjectComment_create')
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += staticfiles_urlpatterns()