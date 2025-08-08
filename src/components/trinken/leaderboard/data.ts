export interface Consumer {
  id: number;
  name: string;
  avatar: string;
  amount: number; // Liter
  change: string; // z. B. "+12%"
}

export const allConsumers: Consumer[] = [
  {
    id: 1,
    name: "Alex Johnson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 847,
    change: "+12%",
  },
  {
    id: 2,
    name: "Sarah Chen",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 782,
    change: "+8%",
  },
  {
    id: 3,
    name: "Mike Rodriguez",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 756,
    change: "+15%",
  },
  {
    id: 4,
    name: "Emma Wilson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 698,
    change: "+5%",
  },
  {
    id: 5,
    name: "David Kim",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 645,
    change: "+18%",
  },
  {
    id: 6,
    name: "Lisa Thompson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 612,
    change: "+3%",
  },
  {
    id: 7,
    name: "James Brown",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 589,
    change: "+7%",
  },
  {
    id: 8,
    name: "Anna Garcia",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 567,
    change: "+11%",
  },
  {
    id: 9,
    name: "Tom Anderson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 534,
    change: "+9%",
  },
  {
    id: 10,
    name: "Rachel Lee",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 498,
    change: "+6%",
  },
];

export const monthlyData: { month: string; consumption: number }[] = [
  { month: "Jul", consumption: 12450 },
  { month: "Aug", consumption: 13200 },
  { month: "Sep", consumption: 11800 },
  { month: "Okt", consumption: 14100 },
  { month: "Nov", consumption: 15300 },
  { month: "Dez", consumption: 16750 },
];

export const growthRate = 12.5; // Beispiel-Wachstumsrate in %
