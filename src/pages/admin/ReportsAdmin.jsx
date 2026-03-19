import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function ReportsAdmin() {
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchReportData = async () => {
    setLoading(true);

    // Step 1: Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return;

    // Step 2: Get company_id from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return;

    const company_id = profile.company_id;

    // Step 3: Fetch total income (payments)
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('company_id', company_id);

    const totalIncome = paymentsData?.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // Step 4: Fetch total expenses
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('amount')
      .eq('company_id', company_id);

    const totalExpenses = expensesData?.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    setIncome(totalIncome || 0);
    setExpenses(totalExpenses || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const netProfit = income - expenses;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold mb-6">Business Summary</h2>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-medium mb-1">Total Income</h3>
            <p className="text-green-700 text-xl font-bold">
              ${income.toFixed(2)}
            </p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-medium mb-1">Total Expenses</h3>
            <p className="text-red-600 text-xl font-bold">
              ${expenses.toFixed(2)}
            </p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-medium mb-1">Net Profit</h3>
            <p
              className={`text-xl font-bold ${
                netProfit >= 0 ? 'text-green-700' : 'text-red-600'
              }`}
            >
              ${netProfit.toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}