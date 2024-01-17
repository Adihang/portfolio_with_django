from django.shortcuts import render
from .models import Project, Project_Comment
from django.shortcuts import get_object_or_404

def main(request):
    context = dict()
    context['projects'] = Project.objects.all()
    return render(request, 'main/main.html', context)

def ProjectDetail(request, project_title):
    context = dict()
    context['project'] = get_object_or_404(Project, title=project_title)
    context['project_comment'] = get_object_or_404(Project_Comment, title=project_title)
    return render(request, 'main/ProjectDetail.html', context)

# Create your views here.
