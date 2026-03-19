import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import Drawer from '../../components/ui/Drawer';
import EmptyState from '../../components/customer/EmptyState';
import { Receipt } from 'lucide-react';

// AI Receipt Extraction Feature Flag
// Requires OPENAI_API_KEY set in Supabase secrets for edge function
const ENABLE_AI_EXTRACTION = true;

export default function ExpensesAdmin() {
  const [expenses, setExpenses] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');

  // Expense drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [manualLineTotalOverrides, setManualLineTotalOverrides] = useState(new Set());
  const [vendor, setVendor] = useState('');
  const [confidence, setConfidence] = useState(null); // Overall confidence and field-level confidence

  // Receipt viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [receiptPages, setReceiptPages] = useState([]);
  const [receiptThumbnails, setReceiptThumbnails] = useState({});
  const [receiptFullImages, setReceiptFullImages] = useState({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);

  // Split expenses state
  const [selectedLineItems, setSelectedLineItems] = useState(new Set());
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);

  // Filter state
  const [datePreset, setDatePreset] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [receiptFilter, setReceiptFilter] = useState('all'); // all, with, without

  // Receipt modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [receiptSignedUrl, setReceiptSignedUrl] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [uploadingReceiptId, setUploadingReceiptId] = useState(null);
  
  // AI Extraction modal state
  const [extractionModalOpen, setExtractionModalOpen] = useState(false);
  const [extractingExpenseId, setExtractingExpenseId] = useState(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionSuggestion, setExtractionSuggestion] = useState(null);
  const [extractionFields, setExtractionFields] = useState({
    amount: false,
    date: false,
    category: false,
    note: false,
    vendor: false,
  });
  const [applyingExtraction, setApplyingExtraction] = useState(false);
  
  // File input ref
  const fileInputRef = useRef(null);

  // Sort state
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Fetch company_id on page load
  useEffect(() => {
    const fetchCompanyId = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Error getting user:', userError);
        setInitialLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        console.error('Error fetching profile:', profileError);
        setInitialLoading(false);
        return;
      }

      setCompanyId(profile.company_id);
      setInitialLoading(false);
    };

    fetchCompanyId();
  }, []);

  // Fetch expenses when companyId is available
  useEffect(() => {
    if (companyId) {
      fetchExpenses();
    }
  }, [companyId]);

  // Load full-size image when viewer index changes
  useEffect(() => {
    if (viewerOpen && receiptPages.length > 0 && viewerIndex >= 0 && viewerIndex < receiptPages.length) {
      const path = receiptPages[viewerIndex];
      if (isImageFile(path) && !receiptFullImages[viewerIndex]) {
        fetchFullSizeImage(path, viewerIndex).catch(error => {
          console.error('Error loading full-size image:', error);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, viewerIndex, receiptPages]);

  const fetchExpenses = async () => {
    if (!companyId) return;

    setLoading(true);
    const {
      data,
      error,
    } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Failed to load expenses');
    } else {
      setExpenses(data || []);
    }
    setLoading(false);
  };

  // Calculate date range based on preset
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (datePreset) {
      case 'this_month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          start: start.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'last_month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        };
      }
      case 'last_30_days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 30);
        return {
          start: start.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'ytd': {
        const start = new Date(today.getFullYear(), 0, 1);
        return {
          start: start.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0],
        };
      }
      case 'custom':
        return {
          start: customStartDate || null,
          end: customEndDate || null,
        };
      default:
        return { start: null, end: null };
    }
  };

  // Filter expenses based on current filters
  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];

    // Date filter
    const { start, end } = getDateRange();
    if (start) {
      filtered = filtered.filter(exp => {
        if (!exp.date) return false;
        return exp.date >= start;
      });
    }
    if (end) {
      filtered = filtered.filter(exp => {
        if (!exp.date) return false;
        return exp.date <= end;
      });
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(exp => exp.category === categoryFilter);
    }

    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(exp =>
        (exp.category?.toLowerCase().includes(searchLower) ||
         exp.note?.toLowerCase().includes(searchLower))
      );
    }

    // Receipt filter (check receipt_paths first, then receipt_path for backward compatibility)
    if (receiptFilter === 'with') {
      filtered = filtered.filter(exp => {
        const hasReceipts = (exp.receipt_paths && Array.isArray(exp.receipt_paths) && exp.receipt_paths.length > 0) || exp.receipt_path;
        return hasReceipts;
      });
    } else if (receiptFilter === 'without') {
      filtered = filtered.filter(exp => {
        const hasReceipts = (exp.receipt_paths && Array.isArray(exp.receipt_paths) && exp.receipt_paths.length > 0) || exp.receipt_path;
        return !hasReceipts;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      if (sortField === 'date') {
        aVal = a.date || '';
        bVal = b.date || '';
      } else if (sortField === 'amount') {
        aVal = Number(a.amount) || 0;
        bVal = Number(b.amount) || 0;
      } else {
        return 0;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [expenses, datePreset, customStartDate, customEndDate, categoryFilter, searchText, receiptFilter, sortField, sortDirection]);

  // Get unique categories from expenses
  const categories = useMemo(() => {
    const cats = [...new Set(expenses.map(exp => exp.category).filter(Boolean))];
    return cats.sort();
  }, [expenses]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const filteredTotal = filteredExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const ytdEnd = now.toISOString().split('T')[0];

    const thisMonth = expenses
      .filter(exp => exp.date >= thisMonthStart && exp.date <= thisMonthEnd)
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    const lastMonth = expenses
      .filter(exp => exp.date >= lastMonthStart && exp.date <= lastMonthEnd)
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    const ytd = expenses
      .filter(exp => exp.date >= ytdStart && exp.date <= ytdEnd)
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    // Top category by spend
    const categoryTotals = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(exp.amount) || 0);
    });
    const topCategory = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      filteredTotal,
      thisMonth,
      lastMonth,
      ytd,
      topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
    };
  }, [filteredExpenses, expenses]);

  // Spend by Category breakdown
  const categoryBreakdown = useMemo(() => {
    const totals = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      totals[cat] = (totals[cat] || 0) + (Number(exp.amount) || 0);
    });

    const total = Object.values(totals).reduce((sum, val) => sum + val, 0);

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // Monthly Spend breakdown
  const monthlyBreakdown = useMemo(() => {
    const monthly = {};
    filteredExpenses.forEach(exp => {
      if (!exp.date) return;
      const monthKey = exp.date.substring(0, 7); // YYYY-MM
      monthly[monthKey] = (monthly[monthKey] || 0) + (Number(exp.amount) || 0);
    });

    return Object.entries(monthly)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredExpenses]);

  // Calculate expense total from line items
  const calculateExpenseTotal = useMemo(() => {
    if (lineItems.length === 0) {
      return parseFloat(amount) || 0;
    }
    return lineItems.reduce((sum, item) => {
      const total = Number(item.line_total) || 0;
      return sum + total;
    }, 0);
  }, [lineItems, amount]);

  // Fetch line items for an expense
  const fetchLineItems = async (expenseId) => {
    if (!expenseId || !companyId) return;

    const { data, error } = await supabase
      .from('expense_items')
      .select('*')
      .eq('expense_id', expenseId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching line items:', error);
      return [];
    }

    return data || [];
  };

  // Open drawer for new expense
  const openNewExpenseDrawer = () => {
    setEditingExpenseId(null);
    setAmount('');
    setCategory('');
    setNote('');
    setDate('');
    setVendor('');
    setLineItems([]);
    setManualLineTotalOverrides(new Set());
    setConfidence(null);
    setReceiptPages([]);
    setReceiptThumbnails({});
    setReceiptFullImages({});
    setViewerOpen(false);
    setViewerIndex(0);
    setSelectedLineItems(new Set());
    setDrawerOpen(true);
  };

  // Get receipt pages from expense (receipt_paths or receipt_path)
  const getReceiptPages = (expense) => {
    if (expense.receipt_paths && Array.isArray(expense.receipt_paths) && expense.receipt_paths.length > 0) {
      return expense.receipt_paths.filter((path) => path && typeof path === 'string');
    } else if (expense.receipt_path && typeof expense.receipt_path === 'string') {
      return [expense.receipt_path];
    }
    return [];
  };

  // Fetch signed URLs for receipt thumbnails
  const fetchReceiptThumbnails = async (pages) => {
    if (pages.length === 0) {
      setReceiptThumbnails({});
      return;
    }

    setLoadingThumbnails(true);
    const thumbnails = {};

    try {
      // Fetch signed URLs for all pages in parallel
      const thumbnailPromises = pages.map(async (path, index) => {
        try {
          const { data, error } = await supabase.storage
            .from('expense-receipts')
            .createSignedUrl(path, 60);

          if (error || !data) {
            console.error(`Failed to generate thumbnail URL for page ${index + 1}:`, error);
            return { index, url: null };
          }

          return { index, url: data.signedUrl };
        } catch (error) {
          console.error(`Error generating thumbnail URL for page ${index + 1}:`, error);
          return { index, url: null };
        }
      });

      const results = await Promise.all(thumbnailPromises);
      results.forEach(({ index, url }) => {
        if (url) {
          thumbnails[index] = url;
        }
      });

      setReceiptThumbnails(thumbnails);
    } catch (error) {
      console.error('Error fetching receipt thumbnails:', error);
    } finally {
      setLoadingThumbnails(false);
    }
  };

  // Fetch signed URL for full-size image (on demand)
  const fetchFullSizeImage = async (path, index) => {
    // Check if already cached
    if (receiptFullImages[index]) {
      return receiptFullImages[index];
    }

    try {
      const { data, error } = await supabase.storage
        .from('expense-receipts')
        .createSignedUrl(path, 60);

      if (error || !data) {
        console.error(`Failed to generate full-size URL for page ${index + 1}:`, error);
        return null;
      }

      // Cache the URL
      setReceiptFullImages(prev => ({ ...prev, [index]: data.signedUrl }));
      return data.signedUrl;
    } catch (error) {
      console.error(`Error generating full-size URL for page ${index + 1}:`, error);
      return null;
    }
  };

  // Open drawer for editing expense
  const openEditExpenseDrawer = async (expenseId) => {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    setEditingExpenseId(expenseId);
    setAmount(expense.amount?.toString() || '');
    setCategory(expense.category || '');
    setNote(expense.note || '');
    setDate(expense.date || '');
    setVendor('');
    setManualLineTotalOverrides(new Set());
    setConfidence(null);

    // Fetch line items
    const items = await fetchLineItems(expenseId);
    setLineItems(items);

    // Get receipt pages and fetch thumbnails
    const pages = getReceiptPages(expense);
    setReceiptPages(pages);
    await fetchReceiptThumbnails(pages);

    // Reset selected items
    setSelectedLineItems(new Set());

    setDrawerOpen(true);
  };

  // Add new line item
  const addLineItem = () => {
    setLineItems([...lineItems, {
      id: `temp-${Date.now()}`,
      description: '',
      quantity: null,
      unit_price: null,
      line_total: null,
      category: category || null,
      confidence: null,
    }]);
  };

  // Remove line item
  const removeLineItem = (index) => {
    const newItems = lineItems.filter((_, i) => i !== index);
    setLineItems(newItems);
    // Remove from manual overrides if it was there
    const itemId = lineItems[index]?.id;
    if (itemId) {
      setManualLineTotalOverrides(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Update line item field
  const updateLineItem = (index, field, value) => {
    const newItems = [...lineItems];
    const item = { ...newItems[index] };
    
    if (field === 'quantity' || field === 'unit_price') {
      item[field] = value === '' ? null : parseFloat(value) || null;
      
      // Auto-calculate line_total if not manually overridden
      if (!manualLineTotalOverrides.has(item.id)) {
        const qty = item.quantity || 0;
        const price = item.unit_price || 0;
        item.line_total = qty * price || null;
      }
    } else if (field === 'line_total') {
      item.line_total = value === '' ? null : parseFloat(value) || null;
      // Mark as manually overridden
      setManualLineTotalOverrides(prev => new Set(prev).add(item.id));
    } else {
      item[field] = value;
    }

    newItems[index] = item;
    setLineItems(newItems);
  };

  // Toggle line item selection for splitting
  const toggleLineItemSelection = (index) => {
    setSelectedLineItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Split selected line items into new expenses
  const handleSplitExpenses = async () => {
    if (selectedLineItems.size === 0 || !editingExpenseId || !companyId) {
      return;
    }

    setSplitting(true);

    try {
      // Get the original expense
      const originalExpense = expenses.find(e => e.id === editingExpenseId);
      if (!originalExpense) {
        toast.error('Original expense not found');
        setSplitting(false);
        return;
      }

      // Ensure we have a valid company_id from the original expense
      const expenseCompanyId = originalExpense.company_id || companyId;
      if (!expenseCompanyId) {
        toast.error('Company ID not found. Cannot create split expenses.');
        setSplitting(false);
        return;
      }

      // Get selected items
      const selectedItems = Array.from(selectedLineItems)
        .map(index => ({ index, item: lineItems[index] }))
        .filter(({ item }) => item && item.description);

      if (selectedItems.length === 0) {
        toast.error('No valid items selected');
        setSplitting(false);
        return;
      }

      // Get receipt paths from original expense
      const receiptPaths = originalExpense.receipt_paths && Array.isArray(originalExpense.receipt_paths) && originalExpense.receipt_paths.length > 0
        ? originalExpense.receipt_paths
        : originalExpense.receipt_path
          ? [originalExpense.receipt_path]
          : [];

      const createdExpenseIds = [];
      const errors = [];

      // Create new expenses for each selected item (sequentially)
      for (const { index, item } of selectedItems) {
        try {
          // Safely convert line_total to numeric
          const itemLineTotal = item.line_total === null || item.line_total === undefined 
            ? 0 
            : Number(item.line_total);
          const safeAmount = Number.isNaN(itemLineTotal) ? 0 : itemLineTotal;

          // Create new expense with explicit company_id from original expense
          const newExpenseData = {
            company_id: expenseCompanyId,
            amount: safeAmount,
            date: originalExpense.date || date || new Date().toISOString().split('T')[0],
            category: item.category || originalExpense.category || category || null,
            note: `Split from receipt of expense #${editingExpenseId}`,
            receipt_path: receiptPaths[0] || null,
            receipt_paths: receiptPaths.length > 0 ? receiptPaths : null,
            receipt_uploaded_at: originalExpense.receipt_uploaded_at || null,
          };

          const { data: newExpense, error: expenseError } = await supabase
            .from('expenses')
            .insert([newExpenseData])
            .select()
            .single();

          if (expenseError || !newExpense) {
            console.error("Failed to create expense", { item, error: expenseError });
            const msg = expenseError?.message || expenseError?.details || JSON.stringify(expenseError);
            errors.push(`Item "${item.description}": ${msg || 'Failed to create expense'}`);
            continue;
          }

          createdExpenseIds.push(newExpense.id);

          // Create expense_item for the new expense
          const itemData = {
            company_id: expenseCompanyId,
            expense_id: newExpense.id,
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
            category: item.category || null,
          };

          const { error: itemError } = await supabase
            .from('expense_items')
            .insert([itemData]);

          if (itemError) {
            console.error("Failed to create expense_item", { item, error: itemError });
            const msg = itemError?.message || itemError?.details || JSON.stringify(itemError);
            errors.push(`Item "${item.description}": Failed to create line item - ${msg || 'Unknown error'}`);
            // Continue - expense was created, item can be added manually
          }
        } catch (error) {
          console.error(`Error processing item ${index + 1}:`, error);
          errors.push(`Item "${item.description}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Determine remaining items (items not selected)
      const remainingItems = lineItems.filter((_, index) => !selectedLineItems.has(index));
      const allItemsSplit = remainingItems.length === 0;
      
      // Only proceed with update/delete if all selected items were successfully created
      // (i.e., no errors occurred during creation)
      const allItemsCreatedSuccessfully = errors.length === 0 && createdExpenseIds.length === selectedItems.length;

      // Track whether original expense was deleted
      let originalExpenseDeleted = false;

      if (allItemsSplit && allItemsCreatedSuccessfully) {
        // Option A: All items were split successfully - delete the original expense
        const { error: deleteExpenseError } = await supabase
          .from('expenses')
          .delete()
          .eq('id', editingExpenseId)
          .eq('company_id', expenseCompanyId);

        if (deleteExpenseError) {
          console.error('Failed to delete original expense:', deleteExpenseError);
          toast.error('Failed to delete original expense after split');
          // Continue - new expenses were created
        } else {
          // Successfully deleted original expense
          originalExpenseDeleted = true;
          
          // Close drawer and clear editing state
          setDrawerOpen(false);
          setEditingExpenseId(null);
          setLineItems([]);
          setSelectedLineItems(new Set());
          setSplitConfirmOpen(false);
          setVendor('');
          setConfidence(null);
          
          // Show success toast
          toast.success(
            `Created ${createdExpenseIds.length} new expense(s). Original removed (all items were split).`
          );
          
          // Log results for debugging
          console.log('Split expenses completed (original deleted):', {
            createdExpenseIds,
            originalExpenseId: editingExpenseId,
            errors: null,
          });
        }
      } else {
        // Partial split or errors occurred - update original expense with remaining items
        const remainingAmount = remainingItems.reduce((sum, item) => {
          // Safely convert line_total to numeric
          const lt = item.line_total === null || item.line_total === undefined 
            ? 0 
            : Number(item.line_total);
          const safeTotal = Number.isNaN(lt) ? 0 : lt;
          return sum + safeTotal;
        }, 0);

        // Delete selected items from original expense
        const selectedItemIds = selectedItems
          .map(({ item }) => item.id)
          .filter(id => id && !id.toString().startsWith('temp-')); // Only delete real DB items

        if (selectedItemIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('expense_items')
            .delete()
            .in('id', selectedItemIds)
            .eq('expense_id', editingExpenseId)
            .eq('company_id', expenseCompanyId);

          if (deleteError) {
            console.error('Failed to delete selected items from original expense:', deleteError);
            // Continue anyway - items will be removed from UI
          }
        }

        // Update original expense amount (ensure it's a number, not null/undefined)
        const safeRemainingAmount = Number.isNaN(remainingAmount) ? 0 : remainingAmount;
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            amount: safeRemainingAmount,
          })
          .eq('id', editingExpenseId)
          .eq('company_id', expenseCompanyId);

        if (updateError) {
          console.error('Failed to update original expense amount:', updateError);
          // Continue - new expenses were created
        }

        // Update local state
        setLineItems(remainingItems);
        setSelectedLineItems(new Set());
        setSplitConfirmOpen(false);

        // Log results for debugging
        console.log('Split expenses completed:', {
          createdExpenseIds,
          originalExpenseId: editingExpenseId,
          remainingAmount,
          errors: errors.length > 0 ? errors : null,
        });

        // Show results with detailed feedback
        if (errors.length > 0) {
          // Partial failure - show error
          toast.error(
            `Split completed with errors: created ${createdExpenseIds.length}, failed ${errors.length}. Check console for details.`
          );
          console.error('Split errors:', errors);
        } else {
          // Full success (but not all items split)
          toast.success(
            `Created ${createdExpenseIds.length} new expense(s). Original updated.`
          );
        }
      }

      // Guaranteed refresh: fetch expenses list first
      await fetchExpenses();

      // Then refresh line items for the original expense if drawer is still open and original exists
      if (editingExpenseId && !originalExpenseDeleted) {
        // Only refresh if original wasn't deleted
        try {
          const refreshedItems = await fetchLineItems(editingExpenseId);
          setLineItems(refreshedItems);
        } catch (error) {
          // Original expense may have been deleted or doesn't exist
          console.warn('Could not refresh line items (expense may have been deleted):', error);
        }
      }
    } catch (error) {
      console.error('Error splitting expenses:', error);
      toast.error('Failed to split expenses');
    } finally {
      setSplitting(false);
    }
  };

  // Save expense (create or update)
  const saveExpense = async () => {
    // Validation
    if (lineItems.length > 0) {
      const hasInvalidItem = lineItems.some(item => !item.description || item.description.trim() === '');
      if (hasInvalidItem) {
        toast.error('All line items must have a description');
        return;
      }
    } else {
      // Fallback to old behavior if no line items
      if (!amount || !category) {
        toast.error('Amount and Category required (or add line items)');
        return;
      }
    }

    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    setLoading(true);

    try {
      const expenseDate = date || new Date().toISOString().split('T')[0];
      const expenseAmount = lineItems.length > 0 ? calculateExpenseTotal : parseFloat(amount);

      if (editingExpenseId) {
        // Update existing expense
        const { error: updateError } = await supabase
          .from('expenses')
          .update({
            amount: expenseAmount,
            category,
            note: note || null,
            date: expenseDate,
          })
          .eq('id', editingExpenseId)
          .eq('company_id', companyId);

        if (updateError) {
          console.error('Error updating expense:', updateError);
          toast.error('Failed to update expense');
          setLoading(false);
          return;
        }

        // Delete existing line items
        const { error: deleteError } = await supabase
          .from('expense_items')
          .delete()
          .eq('expense_id', editingExpenseId)
          .eq('company_id', companyId);

        if (deleteError) {
          console.error('Error deleting old line items:', deleteError);
          toast.error('Failed to update line items');
          setLoading(false);
          return;
        }

        // Insert new line items
        if (lineItems.length > 0) {
          const itemsToInsert = lineItems.map(item => ({
            company_id: companyId,
            expense_id: editingExpenseId,
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
            category: item.category || null,
          }));

          const { error: insertError } = await supabase
            .from('expense_items')
            .insert(itemsToInsert);

          if (insertError) {
            console.error('Error inserting line items:', insertError);
            toast.error('Failed to save line items');
            setLoading(false);
            return;
          }
        }

        toast.success('Expense updated');
      } else {
        // Create new expense
        const { data: newExpense, error: insertError } = await supabase
          .from('expenses')
          .insert([{
            amount: expenseAmount,
            category,
            note: note || null,
            date: expenseDate,
            company_id: companyId,
          }])
          .select()
          .single();

        if (insertError) {
          console.error('Error adding expense:', insertError);
          toast.error('Failed to add expense');
          setLoading(false);
          return;
        }

        // Insert line items if any
        if (lineItems.length > 0 && newExpense) {
          const itemsToInsert = lineItems.map(item => ({
            company_id: companyId,
            expense_id: newExpense.id,
            description: item.description.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
            category: item.category || null,
          }));

          const { error: itemsError } = await supabase
            .from('expense_items')
            .insert(itemsToInsert);

          if (itemsError) {
            console.error('Error inserting line items:', itemsError);
            toast.error('Expense created but failed to save line items');
            setLoading(false);
            return;
          }
        }

        toast.success('Expense added');
      }

      // Reset form and close drawer
      setAmount('');
      setCategory('');
      setNote('');
      setDate('');
      setVendor('');
      setLineItems([]);
      setManualLineTotalOverrides(new Set());
      setEditingExpenseId(null);
      setDrawerOpen(false);
      setReceiptPages([]);
      setReceiptThumbnails({});
      setReceiptFullImages({});
      setViewerOpen(false);
      setViewerIndex(0);
      setSelectedLineItems(new Set());
      fetchExpenses();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const addExpense = async () => {
    // Legacy function - now just opens drawer
    openNewExpenseDrawer();
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }

    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    } else {
      toast.success('Expense deleted');
      fetchExpenses();
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const clearFilters = () => {
    setDatePreset('this_month');
    setCustomStartDate('');
    setCustomEndDate('');
    setCategoryFilter('all');
    setSearchText('');
    setReceiptFilter('all');
  };

  const handleReceiptUpload = async (expenseId, files) => {
    // Handle both single file (backward compatibility) and FileList/array
    const fileArray = files instanceof FileList 
      ? Array.from(files) 
      : Array.isArray(files) 
        ? files 
        : files ? [files] : [];
    
    if (fileArray.length === 0) return;
    
    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    // Validate file types (images only)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const invalidFiles = fileArray.filter(file => !validTypes.includes(file.type));
    if (invalidFiles.length > 0) {
      toast.error('Please upload images only (JPG, PNG, GIF, WEBP)');
      return;
    }

    setUploadingReceiptId(expenseId);

    try {
      const uploadedPaths = [];
      const errors = [];

      // Upload files sequentially for reliability
      for (const file of fileArray) {
        try {
          // Build storage path: {company_id}/expenses/{expense_id}/{timestamp}_{filename}
          const timestamp = Date.now() + Math.random(); // Add random to avoid collisions
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `${companyId}/expenses/${expenseId}/${timestamp}_${sanitizedFileName}`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('expense-receipts')
            .upload(storagePath, file, {
              contentType: file.type,
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error(`Receipt upload failed for ${file.name}:`, uploadError);
            errors.push(`${file.name}: ${uploadError.message}`);
            continue; // Skip this file and continue with others
          }

          uploadedPaths.push(storagePath);
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // If no files succeeded, show error and return
      if (uploadedPaths.length === 0) {
        toast.error(`Failed to upload all receipts: ${errors.join('; ')}`);
        setUploadingReceiptId(null);
        return;
      }

      // Update expense record with all uploaded paths
      const updateData = {
        receipt_paths: uploadedPaths,
        receipt_path: uploadedPaths[0], // First path for backward compatibility
        receipt_uploaded_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', expenseId)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Failed to update expense:', updateError);
        // Try to clean up uploaded files
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('expense-receipts').remove(uploadedPaths);
        }
        toast.error('Failed to save receipt reference');
        setUploadingReceiptId(null);
        return;
      }

      // Show success message with count
      if (errors.length > 0) {
        toast.success(`${uploadedPaths.length} receipt(s) uploaded. ${errors.length} failed.`);
      } else {
        toast.success(`${uploadedPaths.length} receipt(s) uploaded`);
      }
      
      fetchExpenses();
    } catch (error) {
      console.error('Error uploading receipt:', error);
      toast.error('Failed to upload receipt');
    } finally {
      setUploadingReceiptId(null);
    }
  };

  const handleReceiptReplace = (expenseId) => {
    // Trigger file picker with multiple selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*'; // Images only
    input.multiple = true; // Enable multiple file selection
    input.onchange = async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        // Delete old receipts first if they exist
        const expense = expenses.find(e => e.id === expenseId);
        if (expense) {
          const pathsToDelete = [];
          
          // Collect all old receipt paths
          if (expense.receipt_paths && Array.isArray(expense.receipt_paths) && expense.receipt_paths.length > 0) {
            pathsToDelete.push(...expense.receipt_paths);
          } else if (expense.receipt_path) {
            pathsToDelete.push(expense.receipt_path);
          }
          
          // Delete old receipts
          if (pathsToDelete.length > 0) {
            try {
              await supabase.storage
                .from('expense-receipts')
                .remove(pathsToDelete);
            } catch (error) {
              console.error('Failed to delete old receipts:', error);
              // Continue with upload anyway
            }
          }
        }
        // Upload new receipts
        handleReceiptUpload(expenseId, files);
      }
    };
    input.click();
  };

  const handleReceiptDelete = async (expenseId, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Are you sure you want to delete this receipt?')) {
      return;
    }

    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    const expense = expenses.find(e => e.id === expenseId);
    
    // Collect all receipt paths to delete
    const pathsToDelete = [];
    if (expense?.receipt_paths && Array.isArray(expense.receipt_paths) && expense.receipt_paths.length > 0) {
      pathsToDelete.push(...expense.receipt_paths);
    } else if (expense?.receipt_path) {
      pathsToDelete.push(expense.receipt_path);
    }
    
    if (pathsToDelete.length === 0) {
      return;
    }

    try {
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('expense-receipts')
        .remove(pathsToDelete);

      if (deleteError) {
        console.error('Failed to delete receipt from storage:', deleteError);
        // Continue to update DB anyway
      }

      // Update expense record
      const { error: updateError } = await supabase
        .from('expenses')
        .update({
          receipt_path: null,
          receipt_paths: null,
          receipt_uploaded_at: null,
        })
        .eq('id', expenseId)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Failed to update expense:', updateError);
        toast.error('Failed to remove receipt reference');
        return;
      }

      if (!skipConfirm) {
        toast.success('Receipt deleted');
      }
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast.error('Failed to delete receipt');
    }
  };

  const handleViewReceipt = async (expense) => {
    // Prefer receipt_paths[0] if available, else fallback to receipt_path
    const receiptPath = (expense.receipt_paths && Array.isArray(expense.receipt_paths) && expense.receipt_paths.length > 0)
      ? expense.receipt_paths[0]
      : expense.receipt_path;
    
    if (!receiptPath) return;

    setReceiptModalOpen(true);
    setViewingReceipt(expense);
    setReceiptLoading(true);
    setReceiptSignedUrl(null);

    try {
      // Generate signed URL (60 seconds TTL)
      const { data, error } = await supabase.storage
        .from('expense-receipts')
        .createSignedUrl(receiptPath, 60);

      if (error) {
        console.error('Failed to generate signed URL:', error);
        toast.error('Failed to load receipt');
        setReceiptModalOpen(false);
        return;
      }

      setReceiptSignedUrl(data.signedUrl);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      toast.error('Failed to load receipt');
      setReceiptModalOpen(false);
    } finally {
      setReceiptLoading(false);
    }
  };

  const isImageFile = (path) => {
    if (!path) return false;
    const ext = path.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  };

  // Helper function to get confidence badge
  const getConfidenceBadge = (confidenceScore) => {
    if (confidenceScore === null || confidenceScore === undefined) return null;
    
    const score = typeof confidenceScore === 'number' ? confidenceScore : parseFloat(confidenceScore);
    if (isNaN(score)) return null;

    let label, colorClass;
    if (score >= 0.85) {
      label = 'High';
      colorClass = 'bg-green-100 text-green-700';
    } else if (score >= 0.60) {
      label = 'Medium';
      colorClass = 'bg-yellow-100 text-yellow-700';
    } else {
      label = 'Low';
      colorClass = 'bg-red-100 text-red-700';
    }

    return (
      <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded ${colorClass}`}>
        {label}
      </span>
    );
  };

  const handleExtractReceipt = async (expenseId) => {
    if (!ENABLE_AI_EXTRACTION) {
      toast.error('AI extraction is disabled');
      return;
    }

    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    setExtractingExpenseId(expenseId);
    setExtractionLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('extract-expense-receipt', {
        body: { expense_id: expenseId },
      });

      // Handle invoke errors (non-2xx responses)
      if (error) {
        console.error('Extraction error:', error);
        const errorMessage = error.message || 'AI extraction failed';
        toast.error(errorMessage);
        setExtractionLoading(false);
        return;
      }

      // Check if extraction failed (ok: false)
      if (!data || data.ok === false) {
        const message = data?.message || data?.reason || 'AI extraction failed';
        toast.error(message);
        setExtractionLoading(false);
        return;
      }

      // Only proceed if ok === true and suggestion exists
      if (data.ok === true && data.suggestion) {
        const suggestion = data.suggestion;
        
        // Populate header fields (only if they exist in suggestion)
        if (suggestion.vendor !== null && suggestion.vendor !== undefined) {
          setVendor(suggestion.vendor);
        }
        if (suggestion.date !== null && suggestion.date !== undefined) {
          setDate(suggestion.date);
        }
        if (suggestion.amount !== null && suggestion.amount !== undefined) {
          setAmount(suggestion.amount.toString());
        }
        if (suggestion.category !== null && suggestion.category !== undefined) {
          setCategory(suggestion.category);
        }
        if (suggestion.note !== null && suggestion.note !== undefined) {
          setNote(suggestion.note);
        }

        // Store confidence scores
        if (suggestion.confidence) {
          setConfidence(suggestion.confidence);
        }

        // Populate line items if they exist
        if (suggestion.line_items && Array.isArray(suggestion.line_items) && suggestion.line_items.length > 0) {
          const mappedItems = suggestion.line_items.map(item => ({
            id: `temp-${Date.now()}-${Math.random()}`,
            description: item.description || '',
            quantity: item.quantity !== null && item.quantity !== undefined ? item.quantity : null,
            unit_price: item.unit_price !== null && item.unit_price !== undefined ? item.unit_price : null,
            line_total: item.line_total !== null && item.line_total !== undefined ? item.line_total : null,
            category: item.category || '',
            confidence: item.confidence !== null && item.confidence !== undefined ? item.confidence : null,
          }));
          
          setLineItems(mappedItems);
          
          // Recalculate amount from line items
          const calculatedAmount = mappedItems.reduce((sum, item) => {
            const total = Number(item.line_total) || 0;
            return sum + total;
          }, 0);
          
          if (calculatedAmount > 0) {
            setAmount(calculatedAmount.toString());
          }
        }

        // Open the drawer in edit mode
        setEditingExpenseId(expenseId);
        setDrawerOpen(true);
        toast.success('Receipt data extracted');
      } else {
        // Unexpected response format
        toast.error('AI extraction failed: Invalid response');
      }
    } catch (error) {
      console.error('Error calling extraction function:', error);
      toast.error('Failed to extract receipt data');
    } finally {
      setExtractionLoading(false);
    }
  };

  const handleApplyExtraction = async () => {
    if (!extractingExpenseId || !companyId) {
      toast.error('Missing required data');
      return;
    }

    // Build update object only for checked fields
    const updateData = {};
    
    if (extractionFields.amount && extractionSuggestion?.amount !== null) {
      updateData.amount = extractionSuggestion.amount;
    }
    if (extractionFields.date && extractionSuggestion?.date) {
      updateData.date = extractionSuggestion.date;
    }
    if (extractionFields.category && extractionSuggestion?.category) {
      updateData.category = extractionSuggestion.category;
    }
    if (extractionFields.note && extractionSuggestion?.note) {
      updateData.note = extractionSuggestion.note;
    }
    if (extractionFields.vendor && extractionSuggestion?.vendor) {
      // Note: vendor field may not exist in expenses table
      // Add vendor to note field
      if (extractionFields.note && extractionSuggestion?.note) {
        // Both note and vendor selected: combine them
        updateData.note = `${extractionSuggestion.note} (${extractionSuggestion.vendor})`;
      } else if (extractionFields.note) {
        // Only note selected: use note as-is (vendor ignored)
        // (already set above)
      } else {
        // Only vendor selected: use vendor as note
        updateData.note = extractionSuggestion.vendor;
      }
    }

    if (Object.keys(updateData).length === 0) {
      toast.error('Please select at least one field to update');
      return;
    }

    setApplyingExtraction(true);

    try {
      const { error } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', extractingExpenseId)
        .eq('company_id', companyId);

      if (error) {
        console.error('Failed to update expense:', error);
        toast.error('Failed to apply extraction');
        return;
      }

      toast.success('Expense updated');
      setExtractionModalOpen(false);
      fetchExpenses();
    } catch (error) {
      console.error('Error applying extraction:', error);
      toast.error('Failed to apply extraction');
    } finally {
      setApplyingExtraction(false);
    }
  };

  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    const { start, end } = getDateRange();
    const dateRangeStr = start && end 
      ? `${start}_to_${end}`
      : 'all';
    
    const headers = ['Date', 'Amount', 'Category', 'Note'];
    const rows = filteredExpenses.map(exp => [
      exp.date || '—',
      (Number(exp.amount) || 0).toFixed(2),
      exp.category || '',
      exp.note || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${dateRangeStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Expenses exported to CSV');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Track and analyze business expenses"
        actions={
          <Button onClick={exportToCSV} variant="secondary">
            Export CSV
          </Button>
        }
      />

      {/* Add Expense Button */}
      <Card>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Expenses</h3>
          <Button
            onClick={openNewExpenseDrawer}
            variant="primary"
            className="px-4 py-2"
          >
            Add Expense
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Range
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="ytd">Year to Date</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {datePreset === 'custom' && (
            <>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Category or note..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Receipt
            </label>
            <select
              value={receiptFilter}
              onChange={(e) => setReceiptFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="with">With Receipt</option>
              <option value="without">Without Receipt</option>
            </select>
          </div>

          <Button
            onClick={clearFilters}
            variant="tertiary"
            className="px-4 py-2"
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <div className="text-sm text-slate-600 mb-1">Filtered Total</div>
          <div className="text-2xl font-bold text-slate-900">
            ${kpis.filteredTotal.toFixed(2)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">This Month</div>
          <div className="text-2xl font-bold text-slate-900">
            ${kpis.thisMonth.toFixed(2)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">Last Month</div>
          <div className="text-2xl font-bold text-slate-900">
            ${kpis.lastMonth.toFixed(2)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">Year to Date</div>
          <div className="text-2xl font-bold text-slate-900">
            ${kpis.ytd.toFixed(2)}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-600 mb-1">Top Category</div>
          <div className="text-xl font-bold text-slate-900">
            {kpis.topCategory ? (
              <>
                {kpis.topCategory.name}
                <div className="text-sm font-normal text-slate-600 mt-1">
                  ${kpis.topCategory.amount.toFixed(2)}
                </div>
              </>
            ) : (
              '—'
            )}
          </div>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-lg font-medium mb-4">Spend by Category</h3>
          {categoryBreakdown.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left p-2 font-medium text-slate-700">Category</th>
                  <th className="text-right p-2 font-medium text-slate-700">Amount</th>
                  <th className="text-right p-2 font-medium text-slate-700">%</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.map((item) => (
                  <tr key={item.category} className="border-b border-slate-100">
                    <td className="p-2">{item.category}</td>
                    <td className="p-2 text-right">${item.amount.toFixed(2)}</td>
                    <td className="p-2 text-right text-slate-600">{item.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-500 text-sm">No expenses in filtered range</p>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-medium mb-4">Monthly Spend</h3>
          {monthlyBreakdown.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left p-2 font-medium text-slate-700">Month</th>
                  <th className="text-right p-2 font-medium text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map((item) => (
                  <tr key={item.month} className="border-b border-slate-100">
                    <td className="p-2">
                      {new Date(item.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                    </td>
                    <td className="p-2 text-right">${item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-500 text-sm">No expenses in filtered range</p>
          )}
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <h3 className="text-lg font-medium mb-4">Expense History</h3>
        {initialLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses yet"
            description="Expenses will appear here once you add them. Track business costs, receipts, and categories to understand your spending."
            actionLabel="Add Your First Expense"
            onAction={() => setDrawerOpen(true)}
          />
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>No expenses match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="p-2 font-medium text-slate-700">
                    <button
                      onClick={() => handleSort('date')}
                      className="hover:text-slate-900 flex items-center gap-1"
                    >
                      Date
                      {sortField === 'date' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  <th className="p-2 font-medium text-slate-700">
                    <button
                      onClick={() => handleSort('amount')}
                      className="hover:text-slate-900 flex items-center gap-1"
                    >
                      Amount
                      {sortField === 'amount' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  </th>
                  <th className="p-2 font-medium text-slate-700">Category</th>
                  <th className="p-2 font-medium text-slate-700">Note</th>
                  <th className="p-2 font-medium text-slate-700">Receipt</th>
                  <th className="p-2 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2">{formatDate(exp.date)}</td>
                    <td className="p-2">${(Number(exp.amount) || 0).toFixed(2)}</td>
                    <td className="p-2">{exp.category || '—'}</td>
                    <td className="p-2">{exp.note || '—'}</td>
                    <td className="p-2">
                      {((exp.receipt_paths && Array.isArray(exp.receipt_paths) && exp.receipt_paths.length > 0) || exp.receipt_path) ? (
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={() => handleViewReceipt(exp)}
                            variant="secondary"
                            className="text-sm"
                          >
                            View
                          </Button>
                          {ENABLE_AI_EXTRACTION && (
                            <Button
                              onClick={() => handleExtractReceipt(exp.id)}
                              variant="primary"
                              className="text-sm"
                              disabled={extractionLoading}
                            >
                              {extractionLoading && extractingExpenseId === exp.id ? 'Extracting...' : 'Extract'}
                            </Button>
                          )}
                          <Button
                            onClick={() => handleReceiptReplace(exp.id)}
                            variant="tertiary"
                            className="text-sm"
                            disabled={uploadingReceiptId === exp.id}
                          >
                            {uploadingReceiptId === exp.id ? 'Uploading...' : 'Replace'}
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                handleReceiptUpload(exp.id, files);
                              }
                              // Reset input
                              e.target.value = '';
                            }}
                            id={`receipt-upload-${exp.id}`}
                          />
                          <Button
                            onClick={() => {
                              const input = document.getElementById(`receipt-upload-${exp.id}`);
                              if (input) input.click();
                            }}
                            variant="tertiary"
                            className="text-sm"
                            disabled={uploadingReceiptId === exp.id}
                          >
                            {uploadingReceiptId === exp.id ? 'Uploading...' : 'Upload'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => openEditExpenseDrawer(exp.id)}
                          variant="secondary"
                          className="text-sm"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => deleteExpense(exp.id)}
                          variant="danger"
                          className="text-sm"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length > 0 && (
                  <tr className="border-t-2 border-slate-300 font-semibold bg-slate-50">
                    <td className="p-2">Total:</td>
                    <td className="p-2">
                      ${kpis.filteredTotal.toFixed(2)}
                    </td>
                    <td colSpan="4" className="p-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Receipt View Modal */}
      <Drawer
        open={receiptModalOpen}
        title="Receipt"
        onClose={() => {
          setReceiptModalOpen(false);
          setViewingReceipt(null);
          setReceiptSignedUrl(null);
        }}
        widthClass="w-full sm:w-[600px]"
      >
        {receiptLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-slate-500">Loading receipt...</p>
          </div>
        ) : receiptSignedUrl && viewingReceipt ? (
          <div className="space-y-4">
            {(() => {
              // Get the receipt path to check (prefer receipt_paths[0], else receipt_path)
              const receiptPath = (viewingReceipt.receipt_paths && Array.isArray(viewingReceipt.receipt_paths) && viewingReceipt.receipt_paths.length > 0)
                ? viewingReceipt.receipt_paths[0]
                : viewingReceipt.receipt_path;
              return isImageFile(receiptPath);
            })() ? (
              <div className="flex justify-center">
                <img
                  src={receiptSignedUrl}
                  alt="Receipt"
                  className="max-w-full h-auto rounded-lg border border-slate-200"
                  style={{ maxHeight: '70vh' }}
                />
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-600 mb-4">PDF Receipt</p>
                <a
                  href={receiptSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Open receipt in new tab
                </a>
              </div>
            )}
            <div className="flex gap-2 justify-center pt-4 border-t border-slate-200">
              <a
                href={receiptSignedUrl}
                download
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                Download
              </a>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-slate-500">Failed to load receipt</p>
          </div>
        )}
      </Drawer>

      {/* AI Extraction Modal */}
      <Drawer
        open={extractionModalOpen}
        title="Extract Receipt Data"
        onClose={() => {
          if (!extractionLoading && !applyingExtraction) {
            setExtractionModalOpen(false);
            setExtractionSuggestion(null);
            setExtractingExpenseId(null);
            setExtractionFields({
              amount: false,
              date: false,
              category: false,
              note: false,
              vendor: false,
            });
          }
        }}
        disableClose={extractionLoading || applyingExtraction}
        widthClass="w-full sm:w-[600px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => {
                setExtractionModalOpen(false);
                setExtractionSuggestion(null);
                setExtractingExpenseId(null);
              }}
              disabled={extractionLoading || applyingExtraction}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleApplyExtraction}
              disabled={extractionLoading || applyingExtraction || !extractionSuggestion}
            >
              {applyingExtraction ? 'Applying...' : 'Apply Selected'}
            </Button>
          </div>
        }
      >
        {extractionLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-slate-500">Extracting data from receipt...</p>
          </div>
        ) : extractionSuggestion ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 mb-4">
              Review the extracted data and select which fields to update. Fields with existing values require explicit selection to overwrite.
            </p>
            
            {(() => {
              const currentExpense = expenses.find(e => e.id === extractingExpenseId);
              
              const fields = [
                {
                  key: 'amount',
                  label: 'Amount',
                  current: currentExpense?.amount ? `$${Number(currentExpense.amount).toFixed(2)}` : null,
                  suggestion: extractionSuggestion.amount !== null ? `$${Number(extractionSuggestion.amount).toFixed(2)}` : null,
                },
                {
                  key: 'date',
                  label: 'Date',
                  current: currentExpense?.date ? formatDate(currentExpense.date) : null,
                  suggestion: extractionSuggestion.date || null,
                },
                {
                  key: 'category',
                  label: 'Category',
                  current: currentExpense?.category || null,
                  suggestion: extractionSuggestion.category || null,
                },
                {
                  key: 'note',
                  label: 'Note',
                  current: currentExpense?.note || null,
                  suggestion: extractionSuggestion.note || null,
                },
                {
                  key: 'vendor',
                  label: 'Vendor',
                  current: currentExpense?.vendor || null,
                  suggestion: extractionSuggestion.vendor || null,
                },
              ];

              return (
                <div className="space-y-3">
                  {fields.map((field) => {
                    const hasSuggestion = field.suggestion !== null;
                    const hasCurrent = field.current !== null;
                    const isChecked = extractionFields[field.key];
                    
                    if (!hasSuggestion && !hasCurrent) {
                      return null; // Skip fields with no data
                    }

                    return (
                      <div key={field.key} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setExtractionFields(prev => ({
                                ...prev,
                                [field.key]: e.target.checked,
                              }));
                            }}
                            disabled={!hasSuggestion}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              {field.label}
                            </label>
                            {hasCurrent && (
                              <div className="text-sm text-slate-600 mb-1">
                                <span className="font-medium">Current:</span> {field.current}
                              </div>
                            )}
                            {hasSuggestion ? (
                              <div className="text-sm">
                                <span className="font-medium text-green-700">Suggested:</span>{' '}
                                <span className="text-green-600">{field.suggestion}</span>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400 italic">No suggestion available</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-slate-500">No extraction data available</p>
          </div>
        )}
      </Drawer>

      {/* Expense Create/Edit Drawer */}
      <Drawer
        open={drawerOpen}
        title={editingExpenseId ? 'Edit Expense' : 'Add Expense'}
        onClose={() => {
          if (!loading) {
            setDrawerOpen(false);
            setEditingExpenseId(null);
            setAmount('');
            setCategory('');
            setNote('');
            setDate('');
            setVendor('');
            setLineItems([]);
            setManualLineTotalOverrides(new Set());
            setConfidence(null);
            setReceiptPages([]);
            setReceiptThumbnails({});
            setReceiptFullImages({});
            setViewerOpen(false);
            setViewerIndex(0);
            setSelectedLineItems(new Set());
          }
        }}
        disableClose={loading}
        widthClass="w-full sm:w-[800px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => {
                setDrawerOpen(false);
                setEditingExpenseId(null);
                setAmount('');
                setCategory('');
                setNote('');
                setDate('');
                setVendor('');
                setLineItems([]);
                setManualLineTotalOverrides(new Set());
                setConfidence(null);
                setReceiptPages([]);
                setReceiptThumbnails({});
                setReceiptFullImages({});
                setViewerOpen(false);
                setViewerIndex(0);
                setSelectedLineItems(new Set());
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveExpense}
              disabled={loading}
            >
              {loading ? 'Saving...' : editingExpenseId ? 'Update Expense' : 'Save Expense'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Basic Expense Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
                {confidence?.date !== null && confidence?.date !== undefined && getConfidenceBadge(confidence.date)}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Vendor
                {confidence?.vendor !== null && confidence?.vendor !== undefined && getConfidenceBadge(confidence.vendor)}
              </label>
              <input
                type="text"
                placeholder="Vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category
                {confidence?.category !== null && confidence?.category !== undefined && getConfidenceBadge(confidence.category)}
              </label>
              <input
                type="text"
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount {lineItems.length > 0 && <span className="text-slate-500 text-xs">(calculated from line items)</span>}
                {confidence?.amount !== null && confidence?.amount !== undefined && getConfidenceBadge(confidence.amount)}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={lineItems.length > 0 ? calculateExpenseTotal.toFixed(2) : amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={lineItems.length > 0}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="Note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Line Items</h3>
              <Button
                onClick={addLineItem}
                variant="secondary"
                className="text-sm"
              >
                + Add Line Item
              </Button>
            </div>

            {lineItems.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">
                No line items. Add items below or use the amount field above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left p-2 font-medium text-slate-700 w-8">
                        {editingExpenseId && lineItems.length > 0 && (
                          <input
                            type="checkbox"
                            checked={selectedLineItems.size === lineItems.length && lineItems.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLineItems(new Set(lineItems.map((_, i) => i)));
                              } else {
                                setSelectedLineItems(new Set());
                              }
                            }}
                            className="cursor-pointer"
                          />
                        )}
                      </th>
                      <th className="text-left p-2 font-medium text-slate-700">Description</th>
                      <th className="text-left p-2 font-medium text-slate-700">Qty</th>
                      <th className="text-left p-2 font-medium text-slate-700">Unit Price</th>
                      <th className="text-left p-2 font-medium text-slate-700">Line Total</th>
                      <th className="text-left p-2 font-medium text-slate-700">Category</th>
                      <th className="text-left p-2 font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={item.id || index} className="border-b border-slate-100">
                        <td className="p-2">
                          {editingExpenseId && (
                            <input
                              type="checkbox"
                              checked={selectedLineItems.has(index)}
                              onChange={() => toggleLineItemSelection(index)}
                              className="cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Description *"
                              value={item.description || ''}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                              className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm"
                              required
                            />
                            {item.confidence !== null && item.confidence !== undefined && (
                              <div className="flex-shrink-0">
                                {getConfidenceBadge(item.confidence)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Qty"
                            value={item.quantity ?? ''}
                            onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Unit Price"
                            value={item.unit_price ?? ''}
                            onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Total"
                            value={item.line_total ?? ''}
                            onChange={(e) => updateLineItem(index, 'line_total', e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Category"
                            value={item.category || ''}
                            onChange={(e) => updateLineItem(index, 'category', e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <Button
                            onClick={() => removeLineItem(index)}
                            variant="danger"
                            className="text-xs"
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold bg-slate-50">
                      <td className="p-2"></td>
                      <td colSpan="3" className="p-2 text-right">Total:</td>
                      <td className="p-2">
                        ${calculateExpenseTotal.toFixed(2)}
                      </td>
                      <td colSpan="2" className="p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            
            {/* Split Expenses Button */}
            {editingExpenseId && lineItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Button
                  onClick={() => setSplitConfirmOpen(true)}
                  variant="secondary"
                  className="text-sm"
                  disabled={selectedLineItems.size === 0 || splitting}
                >
                  {splitting ? 'Splitting...' : `Split Selected Items Into New Expenses (${selectedLineItems.size} selected)`}
                </Button>
              </div>
            )}
          </div>

          {/* Receipt Pages Section */}
          {receiptPages.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-lg font-medium mb-4">Receipt Pages</h3>
              {loadingThumbnails ? (
                <p className="text-slate-500 text-sm py-4">Loading thumbnails...</p>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {receiptPages.map((path, index) => {
                    const thumbnailUrl = receiptThumbnails[index];
                    const isImage = isImageFile(path);
                    
                    return (
                      <div
                        key={index}
                        className="relative cursor-pointer group"
                        onClick={async () => {
                          if (isImage) {
                            setViewerIndex(index);
                            setViewerOpen(true);
                            // Fetch full-size image on demand (will be loaded by useEffect)
                            await fetchFullSizeImage(path, index);
                          } else {
                            // For non-images, try to open in new tab
                            try {
                              const { data } = await supabase.storage
                                .from('expense-receipts')
                                .createSignedUrl(path, 60);
                              if (data?.signedUrl) {
                                window.open(data.signedUrl, '_blank');
                              }
                            } catch (error) {
                              toast.error('Failed to open receipt');
                            }
                          }
                        }}
                      >
                        <div className="w-20 h-20 border-2 border-slate-200 rounded-md overflow-hidden bg-slate-50 flex items-center justify-center group-hover:border-slate-400 transition-colors">
                          {thumbnailUrl && isImage ? (
                            <img
                              src={thumbnailUrl}
                              alt={`Receipt page ${index + 1}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                // Fallback if image fails to load
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="text-xs text-slate-400 text-center px-2">
                              Page {index + 1}
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs text-center py-0.5 rounded-b-md">
                          {index + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Drawer>

      {/* Receipt Full-Size Viewer Modal */}
      <Drawer
        open={viewerOpen}
        title={`Receipt Page ${viewerIndex + 1} of ${receiptPages.length}`}
        onClose={() => {
          setViewerOpen(false);
        }}
        widthClass="w-full sm:w-[90vw] max-w-6xl"
        footer={
          <div className="flex justify-between items-center w-full">
            <Button
              variant="tertiary"
              onClick={() => {
                if (viewerIndex > 0) {
                  setViewerIndex(viewerIndex - 1);
                }
              }}
              disabled={viewerIndex === 0}
            >
              ← Previous
            </Button>
            <span className="text-sm text-slate-600">
              Page {viewerIndex + 1} of {receiptPages.length}
            </span>
            <Button
              variant="tertiary"
              onClick={() => {
                if (viewerIndex < receiptPages.length - 1) {
                  setViewerIndex(viewerIndex + 1);
                }
              }}
              disabled={viewerIndex === receiptPages.length - 1}
            >
              Next →
            </Button>
          </div>
        }
      >
        {(() => {
          const currentPath = receiptPages[viewerIndex];
          const fullImageUrl = receiptFullImages[viewerIndex];
          const isImage = isImageFile(currentPath);

          if (!fullImageUrl) {
            return (
              <div className="flex items-center justify-center py-12">
                <p className="text-slate-500">Loading receipt...</p>
              </div>
            );
          }

          if (isImage) {
            return (
              <div className="flex justify-center items-center min-h-[60vh]">
                <img
                  src={fullImageUrl}
                  alt={`Receipt page ${viewerIndex + 1}`}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg border border-slate-200"
                />
              </div>
            );
          }

          return (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">Non-image receipt file</p>
              <a
                href={fullImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Open receipt in new tab
              </a>
            </div>
          );
        })()}
      </Drawer>

      {/* Split Confirmation Modal */}
      <Drawer
        open={splitConfirmOpen}
        title="Split Into Multiple Expenses"
        onClose={() => {
          if (!splitting) {
            setSplitConfirmOpen(false);
          }
        }}
        disableClose={splitting}
        widthClass="w-full sm:w-[500px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="tertiary"
              onClick={() => setSplitConfirmOpen(false)}
              disabled={splitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSplitExpenses}
              disabled={splitting}
            >
              {splitting ? 'Creating...' : 'Confirm Split'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Create new expenses from {selectedLineItems.size} selected item(s)?
          </p>
          
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Selected Items:</p>
            <ul className="text-sm text-slate-600 space-y-1">
              {Array.from(selectedLineItems).map(index => {
                const item = lineItems[index];
                return (
                  <li key={index}>
                    • {item.description || 'Untitled'} - ${Number(item.line_total || 0).toFixed(2)}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="text-sm text-slate-600">
            <p className="font-medium mb-1">What will happen:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>{selectedLineItems.size} new expense(s) will be created</li>
              <li>Each expense will inherit the receipt images</li>
              <li>Selected items will be removed from the original expense</li>
              <li>Original expense amount will be recalculated</li>
            </ul>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
