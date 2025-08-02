---
layout: base-layout.liquid

pagination:
  data: flatMenuData
  size: 1
  alias: entry
  addAllPagesToCollections: true

permalink: '/pitika/{{ entry.scx_path }}/index.html'
eleventyComputed:
  title: '{{ entry.original_title | default: entry.root_name }}—{{ entry.translated_title | default: entry.translated_name }}'
---

# {{ title }}

{{ entry.blurb }}

{% if entry.children.length %}
<ul>
  {% for child in entry.children %}
    <li>
    <!-- Check when the nested menu link should change to the root level chapter link, to sync URL structure with SuttaCentral.net -->
    {% capture has_leaf_grandchild %}false{% endcapture %}
    {% if child.children.size > 0 %}
      {% for grandchild in child.children %}
        {% if grandchild.node_type == 'leaf' %}
          {% capture has_leaf_grandchild %}true{% endcapture %}
        {% endif %}
      {% endfor %}
    {% endif %}
    <h2>
      <a href="{% if has_leaf_grandchild == 'true' %}/{{ child.uid }}/{% else %}/pitika/{{ entry.scx_path }}/{{ child.uid }}/{% endif %}">
        {{ child.original_title | default: child.root_name }}—{{ child.translated_title | default: child.translated_name }}
      </a>
    </h2>
      <p>{{ child.blurb }}</p>
      {% if child.translations.length %}
        <ul>
            {% for version in child.translations %}
            <li>
                <a href="/pitika{{ entry.scx_path }}/{{ child.uid }}/{{ version.lang }}/{{ version.author_uid }}">
                    {{ version.lang_name }}—{{ version.author }}
                </a>—<span>{{ version.title }}</span>
            </li>
            {% endfor %}
        </ul>
      {% endif %}
    </li>
  {% endfor %}
</ul>
{% endif %}
{% if entry.translations.length %}
<ul>
  {% for version in entry.translations %}
    <li>
      <a href="/pitika{{ entry.scx_path }}/{{ version.lang }}/{{ version.author_uid }}">
          {{ version.lang_name }}—{{ version.author }}
      </a>
      <p>{{ version.title }} </p>
    </li>
  {% endfor %}
</ul>
{% endif %}

{% comment %}
<script>
  const data = {{ entry | jsonify }};
  console.log('entry:', data);
</script>
{% endcomment %}
