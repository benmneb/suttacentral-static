---
layout: base-layout.liquid

pagination:
  data: flatMenuData
  size: 1
  alias: entry
  addAllPagesToCollections: true

permalink: '/pitika/{{ entry.scx_path }}/index.html'
eleventyComputed:
  title: '{{ entry.original_title | default: entry.root_name }} - {{ entry.translated_title | default: entry.translated_name }}'
---

# {{ title }}

{{ entry.blurb }}

{% if entry.children.length %}
<ul>
  {% for child in entry.children %}
    <li>
      <a href="/pitika{{ entry.scx_path }}/{{ child.uid }}/">
        {{ child.original_title | default: child.root_name }} - {{ child.translated_title | default: child.translated_name }}
      </a>
      <p>{{ child.blurb }} </p>
    </li>
  {% endfor %}
</ul>
{% endif %}
{% if entry.translations.length %}
<ul>
  {% for version in entry.translations %}
    <li>
      <a href="/pitika{{ entry.scx_path }}/{{ version.lang }}/{{ version.author_uid }}">
          {{ version.lang_name }} - {{ version.author }}
      </a>
      <p>{{ version.title }} </p>
    </li>
  {% endfor %}
</ul>
{% endif %}

<script>
  const data = {{ entry | jsonify }};
  console.log('entry:', data);
</script>
