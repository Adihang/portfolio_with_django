from django.contrib import admin

from .models import Portfolio, Portfolio_Tag

@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ['portfolio']

admin.site.register(Portfolio_Tag)
# Register your models here.
