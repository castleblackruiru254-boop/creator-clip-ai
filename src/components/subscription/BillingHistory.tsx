import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Download, 
  Search, 
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  CreditCard,
  Calendar,
  ArrowUpDown
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Transaction {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  paid_at: string;
  reference: string;
  description?: string;
  plan_name?: string;
  credits_added?: number;
  transaction_type: 'payment' | 'refund' | 'credit';
}

interface BillingFilters {
  status: string;
  dateRange: string;
  searchQuery: string;
  transactionType: string;
}

const BillingHistory = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState<BillingFilters>({
    status: 'all',
    dateRange: 'all',
    searchQuery: '',
    transactionType: 'all'
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user) {
      loadTransactions();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [transactions, filters, sortOrder]);

  const loadTransactions = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('billing_transactions')
        .select(`
          id,
          amount,
          status,
          payment_method,
          paid_at,
          reference,
          description,
          credits_added,
          transaction_type
        `)
        .eq('user_id', user?.id)
        .order('paid_at', { ascending: false });

      if (error) throw error;

      setTransactions(data || []);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      toast({
        title: "Failed to Load Transactions",
        description: "Could not load your billing history. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Filter by status
    if (filters.status !== 'all') {
      filtered = filtered.filter(t => t.status === filters.status);
    }

    // Filter by transaction type
    if (filters.transactionType !== 'all') {
      filtered = filtered.filter(t => t.transaction_type === filters.transactionType);
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (filters.dateRange) {
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          filterDate.setMonth(now.getMonth() - 3);
          break;
        case 'year':
          filterDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      filtered = filtered.filter(t => new Date(t.paid_at) >= filterDate);
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.reference.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.payment_method.toLowerCase().includes(query)
      );
    }

    // Sort by date
    filtered.sort((a, b) => {
      const dateA = new Date(a.paid_at);
      const dateB = new Date(b.paid_at);
      return sortOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });

    setFilteredTransactions(filtered);
  };

  const handleDownloadInvoice = async (transactionId: string) => {
    try {
      setDownloading(true);

      const response = await fetch(`/api/paystack-integration/download-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction_id: transactionId,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${transactionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "Invoice Downloaded",
          description: "Your invoice has been downloaded successfully.",
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not download the invoice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'payment':
        return 'text-green-600';
      case 'refund':
        return 'text-red-600';
      case 'credit':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const clearFilters = () => {
    setFilters({
      status: 'all',
      dateRange: 'all',
      searchQuery: '',
      transactionType: 'all'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-muted rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Billing History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div className="grid md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                className="pl-9"
              />
            </div>
            
            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.transactionType} onValueChange={(value) => setFilters({ ...filters, transactionType: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="payment">Payments</SelectItem>
                <SelectItem value="refund">Refunds</SelectItem>
                <SelectItem value="credit">Credits</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.dateRange} onValueChange={(value) => setFilters({ ...filters, dateRange: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="quarter">Last Quarter</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1"
              >
                <ArrowUpDown className="h-4 w-4" />
                Date
              </Button>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <Filter className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        {filteredTransactions.length > 0 ? (
          <div className="space-y-4">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(transaction.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">${transaction.amount.toFixed(2)}</p>
                        <span className={`text-xs font-medium uppercase ${getTransactionTypeColor(transaction.transaction_type)}`}>
                          {transaction.transaction_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{transaction.payment_method}</span>
                        <span>•</span>
                        <span>{transaction.reference}</span>
                        {transaction.credits_added && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600">+{transaction.credits_added} credits</span>
                          </>
                        )}
                      </div>
                      {transaction.description && (
                        <p className="text-sm text-muted-foreground mt-1">{transaction.description}</p>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                      {transaction.status}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{format(parseISO(transaction.paid_at), 'MMM dd, yyyy HH:mm')}</span>
                    </div>
                  </div>
                  
                  {transaction.status === 'completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadInvoice(transaction.id)}
                      disabled={downloading}
                      className="flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            {transactions.length === 0 ? (
              <>
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">No transactions yet</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Your payment history will appear here once you make a purchase.
                </p>
                <Button onClick={() => window.location.href = '/pricing'}>
                  View Pricing Plans
                </Button>
              </>
            ) : (
              <>
                <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">No transactions match your filters</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Try adjusting your search criteria or clear the filters.
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </>
            )}
          </div>
        )}

        {/* Summary */}
        {filteredTransactions.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {filteredTransactions.length}
                </p>
                <p className="text-xs text-muted-foreground">Total Transactions</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  ${filteredTransactions
                    .filter(t => t.transaction_type === 'payment' && t.status === 'completed')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Total Payments</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">
                  ${filteredTransactions
                    .filter(t => t.transaction_type === 'refund' && t.status === 'completed')
                    .reduce((sum, t) => sum + t.amount, 0)
                    .toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Total Refunds</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {filteredTransactions
                    .filter(t => t.status === 'completed')
                    .reduce((sum, t) => sum + (t.credits_added || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Credits Received</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BillingHistory;
