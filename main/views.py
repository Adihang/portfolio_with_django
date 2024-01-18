from django.shortcuts import render, get_object_or_404, redirect
from .models import Project, Project_Comment
from django.utils import timezone
import markdown

def main(request):
    context = dict()
    context['projects'] = Project.objects.all()
    return render(request, 'main.html', context)

def ProjectDetail(request, project_id):
    context = dict()
    context['project'] = get_object_or_404(Project, id=project_id)
    content_md = context['project'].content
    content_html = markdown.markdown(content_md)
    context['project'].content = content_html
    return render(request, 'main/ProjectDetail.html', context)

def ProjectComment_create(request, project_id):
    project = get_object_or_404(Project, pk=project_id)
    project.project_comment_set.create(content=request.POST.get('content'), create_date=timezone.now())
    return redirect('main:ProjectDetail', project_id=project.id)

# Create your views here.
