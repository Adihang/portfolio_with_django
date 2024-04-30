from django.contrib import admin

from .models import Project, Project_Tag, Career, Hobby, Stratagem, Stratagem_Class, Stratagem_Hero_Score

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Project_Tag)

@admin.register(Career)
class CareerAdmin(admin.ModelAdmin):
    list_display = ['company']

@admin.register(Hobby)
class HobbyAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Stratagem_Class)

@admin.register(Stratagem)
class StratagemAdmin(admin.ModelAdmin):
    list_display = ['name']
    
@admin.register(Stratagem_Hero_Score)
class Stratagem_Hero_ScoreAdmin(admin.ModelAdmin):
    list_display = ['name']