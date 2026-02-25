from django.urls import path, re_path
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.none, name='none'),
    re_path(r'^(?P<ui_lang>ko|en)/portfolio/$', views.main, name='main_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/project/(?P<project_id>\d+)/$', views.ProjectDetail, name='ProjectDetail_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/Salvations_Edge_4/$', views.Salvations_Edge_4, name='Salvations_Edge_4_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/Vow_of_the_Disciple/$', views.Vow_of_the_Disciple, name='Vow_of_the_Disciple_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/Stratagem_Hero/$', views.Stratagem_Hero_page, name='Stratagem_Hero_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/Stratagem_Hero/Scoreboard/$', views.Stratagem_Hero_Scoreboard_page, name='Stratagem_Hero_Scoreboard_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/Stratagem_Hero/add_score/$', views.add_score, name='add_score_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/comment/create/(?P<project_id>\d+)/$', views.ProjectComment_create, name='ProjectComment_create_lang'),
    re_path(r'^(?P<ui_lang>ko|en)/api/chat/$', views.chat_with_ai, name='chat_with_ai_lang'),
    path('portfolio/', views.main_legacy_redirect, name='main'),
    path('project/<int:project_id>/', views.project_detail_legacy_redirect, name='ProjectDetail'),
    path('Salvations_Edge_4/', views.salvations_edge_legacy_redirect, name='Salvations_Edge_4'),
    path('Vow_of_the_Disciple/', views.vow_of_the_disciple_legacy_redirect, name='Vow_of_the_Disciple'),
    path('Stratagem_Hero/', views.stratagem_hero_legacy_redirect, name='Stratagem_Hero'),
    path('Stratagem_Hero/Scoreboard/', views.stratagem_hero_scoreboard_legacy_redirect, name='Stratagem_Hero_Scoreboard'),
    path('Stratagem_Hero/add_score/', views.add_score, name='add_score'),
    path('comment/create/<int:project_id>/', views.ProjectComment_create, name='ProjectComment_create'),
    path('api/chat/', views.chat_with_ai, name='chat_with_ai')
]
