const categoryDescriptions = {
  'What to do': 'Activities, wineries and gastronomy nearby.',
  Hotels: 'Places to stay nearby.',
  'Where to eat/drink': 'Local food and drink nearby.',
  'What to see': 'Sights and places to discover nearby.',
  'Tips from the locals': 'Local tips and recommendations.',
  Information: 'Useful information for your visit.',
};

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
        description: categoryDescriptions[category.parent_name ?? category.name] ?? 'Places to discover nearby.',
        categories: [],
      };
      groups.push(group);
    }
    group.categories.push(category);
  }
  return groups;
}
