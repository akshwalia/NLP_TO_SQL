import { useState, useRef, useEffect } from 'react';
import { Database, MessageSquare, Settings, Wifi, WifiOff, BarChart2, Plus, History, RefreshCw } from 'lucide-react';
import Message from './Message';
import SqlResult from './SqlResult';
import SessionManager from './SessionManager';
import Dashboard from './Dashboard';
import SessionsList from './SessionsList';
import { executeQuery, getSessionInfo, getPaginatedResults, listWorkspaceSessions, createSession, activateWorkspace, getSessionMessages } from '../lib/api';

// PaginationInfo interface to match the API response
interface PaginationInfo {
  table_id: string;
  current_page: number;
  total_pages: number;
  total_rows: number;
  page_size: number;
  has_next?: boolean;
  has_prev?: boolean;
}

interface TableInfo {
  name: string;
  description: string;
  sql: string;
  results: any[];
  row_count: number;
  table_id?: string;
  pagination?: PaginationInfo;
}

interface ChatMessage {
  id: string;
  isUser: boolean;
  text: string;
  timestamp: Date;
  query_type?: 'conversational' | 'sql' | 'analysis';
  sqlResult?: {
    sql: string;
    data?: any[];
    error?: string;
    pagination?: PaginationInfo;
    table_id?: string;
  };
  analysisResult?: {
    tables: TableInfo[];
    analysis_type: 'causal' | 'comparative';
  };
}

// Add a new interface for tracking pagination state
interface PaginationState {
  messageId: string;
  tableId: string;
  currentPage: number;
}

interface ChatBotProps {
  workspaceId?: string | null;
  autoSessionId?: string | null;
}

export default function ChatBot({ workspaceId, autoSessionId }: ChatBotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      isUser: false,
      text: 'Hello! I can help you query your database using natural language. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [showSessionsList, setShowSessionsList] = useState(false);
  const [paginationState, setPaginationState] = useState<PaginationState | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [savedQueries, setSavedQueries] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  useEffect(() => {
    inputRef.current?.focus();
    
    if (sessionId) {
      fetchSessionInfo();
    }
  }, [sessionId]);

  // Handle auto session loading when workspace connects with a session ID
  useEffect(() => {
    if (autoSessionId && autoSessionId !== sessionId) {
      handleSessionSelect(autoSessionId);
    }
  }, [autoSessionId]);

  const fetchSessionInfo = async () => {
    if (!sessionId) return;
    
    try {
      const info = await getSessionInfo(sessionId);
      setSessionInfo(info);
      
      // Check if the info returned is the fallback error object
      if (info.error) {
        // Add a message to the chat about the disconnected session
        const errorMessage: ChatMessage = {
          id: `session-error-${Date.now()}`,
          isUser: false,
          text: `⚠️ ${info.description}`,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error fetching session info:', error);
      setSessionId(null);
      setSessionInfo(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      isUser: true,
      text: input,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsProcessing(true);
    
    try {
      let currentSessionId = sessionId;
      
      // Auto-create session if none exists and workspace is connected
      if (!currentSessionId && workspaceId) {
        try {
          const sessionData = await createSession({
            workspace_id: workspaceId,
            name: `Chat Session ${new Date().toLocaleString()}`,
            description: 'Auto-created session'
          });
          
          currentSessionId = sessionData._id;
          setSessionId(currentSessionId);
          
          const systemMessage: ChatMessage = {
            id: `system-${Date.now()}`,
            isUser: false,
            text: `✅ Created new session: ${sessionData.name}`,
            timestamp: new Date(),
          };
          
          setMessages((prev) => [...prev, systemMessage]);
        } catch (error) {
          console.error('Error auto-creating session:', error);
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            isUser: false,
            text: '❌ Failed to create session. Please try connecting to the workspace again.',
            timestamp: new Date(),
          };
          
          setMessages((prev) => [...prev, errorMessage]);
          setIsProcessing(false);
          return;
        }
      }
      
      const result = await executeQuery(currentInput, currentSessionId || undefined);
      
      let responseMessage = result.text || result.message || 'Query executed successfully.';
      const botMessage: ChatMessage = {
        id: `response-${Date.now()}`,
        isUser: false,
        text: responseMessage,
        timestamp: new Date(),
        query_type: result.query_type,
      };
      
      // Handle different response types
      if (result.query_type === 'sql') {
        botMessage.sqlResult = {
          sql: result.sql || '',
          data: result.data,
          error: result.error,
          pagination: result.pagination,
          table_id: result.table_id,
        };
        
        // Log for debugging
        console.log('SQL Result with pagination:', {
          tableId: result.table_id,
          pagination: result.pagination
        });
      } else if (result.query_type === 'analysis') {
        // Each table should have its own table_id for pagination
        const tablesWithIds = result.tables.map((table: any) => {
          console.log('Analysis table:', table);
          return {
            ...table,
            table_id: table.table_id || `table-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            pagination: table.pagination
          };
        });
        
        botMessage.analysisResult = {
          tables: tablesWithIds,
          analysis_type: result.analysis_type
        };
      }
      // For conversational queries, we just use the text
      
      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        isUser: false,
        text: `Error: ${error.message || 'Failed to execute query'}`,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleSessionCreated = (newSessionId: string) => {
    setSessionId(newSessionId);
    
    const systemMessage: ChatMessage = {
      id: `system-${Date.now()}`,
      isUser: false,
      text: `✅ Connected to database successfully. Session ID: ${newSessionId}`,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, systemMessage]);
  };

  const handlePageChange = async (messageId: string, tableId: string, newPage: number) => {
    if (!sessionId || !tableId) {
      console.error('Missing session ID or table ID for pagination', { sessionId, tableId });
      return;
    }
    
    console.log(`Fetching page ${newPage} for table ${tableId} in session ${sessionId}`);
    setIsProcessing(true);
    
    try {
      const result = await getPaginatedResults(sessionId, tableId, newPage);
      console.log('Paginated results:', result);
      
      // Make sure we have the current table_id (it might have changed in the response)
      const currentTableId = result.pagination?.table_id || tableId;
      
      // Update the message with the new data
      setMessages((prevMessages) => 
        prevMessages.map((msg) => {
          if (msg.id === messageId && msg.sqlResult) {
            return {
              ...msg,
              sqlResult: {
                ...msg.sqlResult,
                data: result.data,
                pagination: result.pagination,
                table_id: currentTableId
              }
            };
          } else if (msg.id === messageId && msg.analysisResult) {
            // For analysis results, find and update the specific table
            const updatedTables = msg.analysisResult.tables.map(table => {
              if (table.table_id === tableId) {
                return {
                  ...table,
                  results: result.data,
                  pagination: result.pagination,
                  table_id: currentTableId
                };
              }
              return table;
            });
            
            return {
              ...msg,
              analysisResult: {
                ...msg.analysisResult,
                tables: updatedTables
              }
            };
          }
          return msg;
        })
      );
      
      // Update the pagination state
      setPaginationState({
        messageId,
        tableId: currentTableId,
        currentPage: newPage
      });
    } catch (error) {
      console.error('Error fetching paginated results:', error);
      const errorMessage: ChatMessage = {
        id: `pagination-error-${Date.now()}`,
        isUser: false,
        text: `Error loading page ${newPage}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // New function to save a query to the dashboard
  const handleSaveQuery = (query: any) => {
    setSavedQueries(prev => [...prev, query]);
  };

  const handleNewChat = async () => {
    if (!workspaceId) return;
    
    try {
      const sessionData = await createSession({
        workspace_id: workspaceId,
        name: `Chat Session ${new Date().toLocaleString()}`,
        description: 'New chat session'
      });
      
      setSessionId(sessionData._id);
      setMessages([
        {
          id: 'welcome',
          isUser: false,
          text: 'Hello! I can help you query your database using natural language. How can I help you today?',
          timestamp: new Date(),
        },
      ]);
      
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        isUser: false,
        text: `✅ Started new chat session: ${sessionData.name}`,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, systemMessage]);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  const handleRefreshConnection = async () => {
    if (!workspaceId) return;
    
    try {
      setIsRefreshing(true);
      await activateWorkspace(workspaceId);
      
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        isUser: false,
        text: '✅ Database connection refreshed successfully!',
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, systemMessage]);
    } catch (error) {
      console.error('Error refreshing connection:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        isUser: false,
        text: '❌ Failed to refresh database connection. Please check your connection settings.',
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const sessionMessages = await getSessionMessages(sessionId);
      
      // Convert session messages to ChatMessage format
      const convertedMessages: ChatMessage[] = sessionMessages.map((msg: any) => {
        const queryResult = msg.query_result;
        
        // Determine query type from the query_result
        let queryType: 'conversational' | 'sql' | 'analysis' | undefined;
        if (queryResult?.is_conversational) {
          queryType = 'conversational';
        } else if (queryResult?.is_multi_query || queryResult?.is_why_analysis) {
          queryType = 'analysis';
        } else if (queryResult?.sql) {
          queryType = 'sql';
        }
        
        return {
          id: msg._id || `msg-${Date.now()}-${Math.random()}`,
          isUser: msg.role === 'user',
          text: msg.content,
          timestamp: new Date(msg.created_at || Date.now()),
          query_type: queryType,
          sqlResult: queryResult && queryResult.sql ? {
            sql: queryResult.sql || '',
            data: queryResult.results,
            error: queryResult.error,
            pagination: queryResult.pagination,
            table_id: queryResult.pagination?.table_id,
          } : undefined,
          analysisResult: queryResult && queryResult.tables ? {
            tables: queryResult.tables || [],
            analysis_type: queryResult.analysis_type
          } : undefined
        };
      });

      if (convertedMessages.length > 0) {
        setMessages(convertedMessages);
        
        const systemMessage: ChatMessage = {
          id: `system-${Date.now()}`,
          isUser: false,
          text: `✅ Loaded ${convertedMessages.length} messages from session`,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, systemMessage]);
      } else {
        // If no messages, start with welcome message
        setMessages([
          {
            id: 'welcome',
            isUser: false,
            text: 'Hello! I can help you query your database using natural language. How can I help you today?',
            timestamp: new Date(),
          },
        ]);
        
        const systemMessage: ChatMessage = {
          id: `system-${Date.now()}`,
          isUser: false,
          text: '✅ Session loaded (no previous messages)',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, systemMessage]);
      }
    } catch (error) {
      console.error('Error loading session messages:', error);
      setMessages([
        {
          id: 'error-loading',
          isUser: false,
          text: '❌ Failed to load session messages. Starting with a fresh chat.',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleSessionSelect = async (selectedSessionId: string) => {
    setSessionId(selectedSessionId);
    setShowSessionsList(false);
    
    // Clear current messages and show loading
    setMessages([
      {
        id: 'loading',
        isUser: false,
        text: 'Loading session messages...',
        timestamp: new Date(),
      },
    ]);
    
    // Load session messages
    await loadSessionMessages(selectedSessionId);
    
    // Fetch session info
    fetchSessionInfo();
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-lg border-b border-white/20 py-4 px-6 transition-all duration-300">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                NLP to SQL Assistant
              </h1>
              <p className="text-sm text-gray-500">Powered by AI • Natural Language Database Queries</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewChat}
              disabled={!workspaceId}
              className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </button>

            <button
              onClick={() => setShowSessionsList(true)}
              disabled={!workspaceId}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <History className="h-4 w-4" />
              <span>Chat History</span>
            </button>

            <button
              onClick={handleRefreshConnection}
              disabled={!workspaceId || isRefreshing}
              className="flex items-center space-x-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Connection</span>
            </button>

            <button
              onClick={() => setShowDashboard(true)}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
            >
              <BarChart2 className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            {sessionId ? (
              <div className="flex items-center bg-green-50 px-4 py-2 rounded-full border border-green-200 transition-all duration-300 hover:bg-green-100">
                <Wifi className="h-4 w-4 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-700">
                  {sessionInfo?.db_info?.db_name || 'Connected'}
                </span>
                <div className="h-2 w-2 rounded-full bg-green-500 ml-2 animate-pulse"></div>
              </div>
            ) : (
              <div className="flex items-center bg-gray-50 px-4 py-2 rounded-full border border-gray-200">
                <WifiOff className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-500">Not connected</span>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
        <div className="max-w-5xl mx-auto">
          <div className="space-y-6">
            {messages.map((message, index) => (
              <div 
                key={message.id} 
                className="animate-in slide-in-from-bottom-2 fade-in duration-500"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Message
                  isUser={message.isUser}
                  content={message.text}
                  timestamp={message.timestamp}
                  isConversational={!message.isUser && message.query_type === 'conversational'}
                />
                {/* Render different types of results based on query_type */}
                {message.query_type === 'sql' && message.sqlResult && (
                  <div className="ml-4 mt-4 animate-in fade-in duration-700">
                    <SqlResult
                      sql={message.sqlResult.sql}
                      data={message.sqlResult.data}
                      error={message.sqlResult.error}
                      pagination={message.sqlResult.pagination}
                      onPageChange={(page) => handlePageChange(message.id, message.sqlResult?.table_id || '', page)}
                      sessionId={sessionId || undefined}
                      tableId={message.sqlResult.table_id}
                      onSaveToAnalytics={handleSaveQuery}
                    />
                  </div>
                )}
                {message.query_type === 'analysis' && message.analysisResult && (
                  <div className="ml-4 mt-4 animate-in fade-in duration-700">
                    {message.analysisResult.tables.map((table, tableIndex) => (
                      <div key={tableIndex} className="mb-8 last:mb-0">
                        <SqlResult
                          sql={table.sql}
                          data={table.results}
                          title={table.name}
                          description={table.description}
                          pagination={table.pagination}
                          onPageChange={(page) => handlePageChange(message.id, table.table_id || '', page)}
                          sessionId={sessionId || undefined}
                          tableId={table.table_id}
                          onSaveToAnalytics={handleSaveQuery}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div ref={messagesEndRef} />
          
          {isProcessing && (
            <div className="flex items-center justify-center py-8 animate-in fade-in duration-300">
              <div className="flex items-center space-x-3 bg-white/80 backdrop-blur-sm px-6 py-3 rounded-full shadow-lg border border-white/20">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"></div>
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm font-medium text-gray-600">Processing your query...</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Input Area */}
      <div className="bg-white/80 backdrop-blur-md border-t border-white/20 p-4 md:p-6 shadow-2xl">
        <div className="max-w-5xl mx-auto">
          <form onSubmit={handleSendMessage} className="relative">
            <div className="flex items-center bg-white rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden transition-all duration-300 hover:shadow-2xl focus-within:shadow-2xl focus-within:border-blue-300">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything about your data..."
                className="flex-1 py-4 px-6 text-gray-800 placeholder-gray-400 bg-transparent focus:outline-none text-base"
                disabled={isProcessing}
              />
              <button
                type="submit"
                className={`m-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  isProcessing ? 'opacity-50 cursor-not-allowed scale-100' : 'hover:shadow-lg'
                }`}
                disabled={isProcessing || !input.trim()}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
          
          {!sessionId && (
            <p className="text-center text-sm text-gray-500 mt-3 animate-pulse">
              💡 Connect to a database for persistent context and better results
            </p>
          )}
        </div>
      </div>
      
      {/* Session Manager Dialog */}
      <SessionManager
        isOpen={showSessionManager}
        onClose={() => setShowSessionManager(false)}
        onSessionCreated={handleSessionCreated}
      />

      {/* Dashboard */}
      <Dashboard 
        isOpen={showDashboard}
        onClose={() => setShowDashboard(false)}
        savedQueries={savedQueries}
      />

      {/* Sessions List */}
      {showSessionsList && workspaceId && (
        <SessionsList 
          workspaceId={workspaceId}
          onClose={() => setShowSessionsList(false)}
          onSessionSelect={handleSessionSelect}
        />
      )}
    </div>
  );
}