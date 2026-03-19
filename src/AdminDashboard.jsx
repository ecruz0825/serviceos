import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Jobs',
      desc: 'Manage and assign jobs to crew',
      path: '/admin/jobs'
    },
    {
      title: 'Customers',
      desc: 'Manage customer accounts and details',
      path: '/admin/customers'
    },
    {
      title: 'Workers',
      desc: 'Manage workers and roles',
      path: '/admin/crew'
    },
    {
      title: 'Reports',
      desc: 'View performance, revenue, and stats',
      path: '/admin/reports'
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-8">
      <h1 className="text-4xl font-extrabold mb-10 text-green-800 drop-shadow-lg">
        Admin Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={() => navigate(card.path)}
            className="bg-white shadow hover:shadow-lg rounded-xl p-6 cursor-pointer transition"
          >
            <h2 className="text-xl font-semibold mb-2">{card.title}</h2>
            <p className="text-gray-600">{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}