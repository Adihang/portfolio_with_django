import os

from django.conf import settings


def make_new_path(path_ext: str, dirname: str, new_filename: str) -> str:
    ext = path_ext.split(".")[-1]
    filename = "{}.{}".format(new_filename, ext)
    path = os.path.join(settings.MEDIA_ROOT, dirname)
    if not os.path.isdir(path):
        os.makedirs(path)

    return os.path.join(dirname, filename)
