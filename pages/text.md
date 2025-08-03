---
layout: base-layout.liquid

pagination:
  data: flatTextData
  size: 1
  alias: entry
  addAllPagesToCollections: true

permalink: '{{ entry.scx_path }}/index.html'
eleventyComputed:
  title: '{{ entry.acronym }}: {{ entry.original_title }}—{{ entry.author }}'
---

# {{ entry.title }}

{% comment %}
<script>
  const data = {{ entry | jsonify }};
  console.log(data);
</script>
{% endcomment %}
