---
layout: base-layout.liquid

pagination:
  data: flatMenuData
  size: 1
  alias: entry
  addAllPagesToCollections: true

permalink: '/pitika/{{ entry.scx_path }}/index.html'
eleventyComputed:
  title: '{{ entry.root_name }} - {{ entry.translated_name }}'
---

# {{ title }}

{{ entry.blurb }}

{% if entry.children.length %}
<ul>
  {% for child in entry.children %}
    <li>
      <a href="/pitika{{ entry.scx_path }}/{{ child.uid }}/">
        {{ child.root_name }} - {{ child.translated_name }}
      </a>
      <p>{{ child.blurb }} </p>
    </li>
  {% endfor %}
</ul>
{% endif %}

<script>
  const data = {{ entry | jsonify }};
  console.log('entry:', data);
</script>
