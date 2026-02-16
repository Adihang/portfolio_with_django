from django.urls import path
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.none, name='none'),
    path('portfolio/', views.main, name='main'),
    path('project/<int:project_id>/', views.ProjectDetail, name='ProjectDetail'),
    path('Salvations_Edge_4/', views.Salvations_Edge_4, name='Salvations_Edge_4'),
    path('Vow_of_the_Disciple/', views.Vow_of_the_Disciple, name='Vow_of_the_Disciple'),
    path('Stratagem_Hero/', views.Stratagem_Hero_page, name='Stratagem_Hero'),
    path('Stratagem_Hero/Scoreboard/', views.Stratagem_Hero_Scoreboard_page, name='Stratagem_Hero_Scoreboard'),
    path('Stratagem_Hero/add_score/', views.add_score, name='add_score'),
    path('comment/create/<int:project_id>/', views.ProjectComment_create, name='ProjectComment_create'),
    path('api/chat/', views.chat_with_ai, name='chat_with_ai')
]
