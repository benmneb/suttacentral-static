---
layout: base-layout.liquid
---

# Tipiṭaka—the Three Baskets of the Buddhist canon

<ul>
  {% for item in flatIndexData %}
    <li>
        <h2><a href="pitika/{{item.uid}}">{{ item.root_name }}—{{ item.translated_name }}</a></h2>
        <p>{{ item.blurb }} </p>
    </li>
  {% endfor %}
</ul>

<script>
  const data = {{ flatIndexData | jsonify }};
  console.log(data);
</script>
