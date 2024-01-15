from django.contrib import admin

from .models import Project, Project_Tag

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Project_Tag)
# Register your models here.
