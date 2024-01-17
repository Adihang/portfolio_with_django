from django.db import models
from config.utils import make_new_path
import uuid

class Project_Tag(models.Model):
    tag = models.CharField("태그", max_length=128)

    def __str__(self):
        return self.tag

def upload_to_project(instace: "Project", filename: str) -> str:
    return make_new_path(
        path_ext=filename,
        dirname=f"uploads/contents/project",
        new_filename=str(uuid.uuid4().hex),
    )

class Project(models.Model):
    title = models.CharField('제목', max_length=200)
    banner_img = models.ImageField("대표 이미지", upload_to=upload_to_project)
    tags =  models.ManyToManyField(Project_Tag, verbose_name="태그")
    content = models.TextField('내용')
    create_date = models.DateField('날짜')


class Project_Comment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    content = models.TextField('내용')
    create_date = models.DateTimeField('날짜')
# Create your models here.
