---
layout: base-layout.liquid

pagination:
  data: flatMenuData
  size: 1
  alias: entry
  addAllPagesToCollections: true

permalink: "/pitika/{{ entry.path }}/index.html"
eleventyComputed:
  title: "{{ entry.translated_name }}"
---

# {{ entry.translated_name }}

{{ entry.blurb }}

{% if entry.children.length %}
## Subsections
<ul>
  {% for child in entry.children %}
    <li>
      <a href="/pitika{{ entry.path }}/{{ child.uid }}/">
        {{ child.translated_name }}
      </a>
    </li>
  {% endfor %}
</ul>
{% endif %}

<script>
  const data = {{ entry | jsonify }};
  console.log('entry:', data);
</script>
