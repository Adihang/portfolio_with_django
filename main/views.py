from django.shortcuts import render, get_object_or_404, redirect
from .models import Project, Career, Hobby, Stratagem, Stratagem_Hero_Score
from django.utils import timezone
import markdown
import random

def none(request):
    context = dict()
    return render(request, 'none.html', context)
    

def main(request):
    context = dict()
    context['careers'] = Career.objects.all()
    for i in range(len(context['careers'])):
        context['careers'][i].content = markdown.markdown(context['careers'][i].content)
    context['projects'] = Project.objects.all()
    context['hobbys'] = Hobby.objects.all()
    return render(request, 'main.html', context)

def Stratagem_Hero_page(request):
    context = dict()
    context['score'] = Stratagem_Hero_Score.objects.all()
    all_stratagems = list(Stratagem.objects.all())
    context['stratagems'] = random.sample(all_stratagems, 10)
    return render(request, 'fun/Stratagem_Hero.html', context)

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
