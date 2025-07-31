---
layout: base-layout.liquid
---

# Tipiṭaka—the Three Baskets of the Buddhist canon

<ul>
  {% for item in menuData %}
    <li>
        <a href="pitika/{{item.uid}}">{{ item.root_name }} - {{ item.translated_name }}</a>
        <p>{{ item.blurb }} </p>
    </li>
  {% endfor %}
</ul>

<script>
  const data = {{ menuData | jsonify }};
  console.log('menuData:', data);
</script>
