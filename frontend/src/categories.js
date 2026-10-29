export function categoryGroups(categories) {
  const groups = [];
  for (const category of categories) {
    const id = category.parent_id ?? category.id;
    let group = groups.find((item) => item.id === id);
    if (!group) {
      group = {
        id,
        name: category.parent_name ?? category.name,
        icon: category.parent_icon ?? category.icon,
        color: category.color,
        categories: [],
      };
      groups.push(group);
    }
    group.categories.push(category);
  }
  return groups;
}
