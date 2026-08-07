export function groupTransactionsByDate(list) {
  const groups = []
  const indexesByDate = new Map()

  for (const transaction of list) {
    const key = transaction.date
    let group = groups[indexesByDate.get(key)]

    if (!group) {
      indexesByDate.set(key, groups.length)
      group = { key, items: [], income: 0, expense: 0, net: 0 }
      groups.push(group)
    }

    const amount = Number(transaction.amount) || 0
    group.items.push(transaction)

    if (transaction.type === 'income') group.income += amount
    else group.expense += amount

    group.net = group.income - group.expense
  }

  return groups
}
