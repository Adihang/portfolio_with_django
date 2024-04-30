from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.none, name='none'),
    path('portfolio/', views.main, name='main'),
    path('project/<int:project_id>/', views.ProjectDetail, name='ProjectDetail'),
    path('Stratagem_Hero/', views.Stratagem_Hero_page, name='Stratagem_Hero'),
    path('Stratagem_Hero/Scoreboard/', views.Stratagem_Hero_Scoreboard_page, name='Stratagem_Hero_Scoreboard'),
    path('Stratagem_Hero/add_score/', views.add_score, name='add_score'),
    path('comment/create/<int:project_id>/', views.ProjectComment_create, name='ProjectComment_create')
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += staticfiles_urlpatterns()