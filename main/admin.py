from django.contrib import admin

from .models import Project, Project_Tag, Career

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Project_Tag)

@admin.register(Career)
class CareerAdmin(admin.ModelAdmin):
    list_display = ['company']
# Register your models here.
