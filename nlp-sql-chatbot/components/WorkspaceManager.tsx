import { useState, useEffect } from 'react';
import { Plus, Database, MoreVertical, Edit, Trash2, Loader2, Play, RefreshCw, MessageSquare, History } from 'lucide-react';
import { getAllWorkspaces, createWorkspaceWithDetails, updateWorkspace, deleteWorkspace, activateWorkspace, WorkspaceRequest, listWorkspaceSessions } from '../lib/api';
import WorkspaceForm from './WorkspaceForm';
import SessionsList from './SessionsList';

interface Workspace {
  _id: string;
  name: string;
  description?: string;
  db_connection: {
    db_name: string;
    username: string;
    password: string;
    host: string;
    port: string;
    db_type: string;
  };
  created_at: string;
  updated_at: string;
}

interface WorkspaceManagerProps {
  onWorkspaceConnect: (workspaceId: string, autoSessionId?: string) => void;
}

export default function WorkspaceManager({ onWorkspaceConnect }: WorkspaceManagerProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [connectingWorkspace, setConnectingWorkspace] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const data = await getAllWorkspaces();
      setWorkspaces(data);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async (workspaceData: WorkspaceRequest) => {
    try {
      await createWorkspaceWithDetails(workspaceData);
      await fetchWorkspaces();
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating workspace:', error);
      throw error;
    }
  };

  const handleUpdateWorkspace = async (workspaceId: string, workspaceData: Partial<WorkspaceRequest>) => {
    try {
      await updateWorkspace(workspaceId, workspaceData);
      await fetchWorkspaces();
      setEditingWorkspace(null);
    } catch (error) {
      console.error('Error updating workspace:', error);
      throw error;
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!confirm('Are you sure you want to delete this workspace?')) return;
    
    try {
      await deleteWorkspace(workspaceId);
      await fetchWorkspaces();
    } catch (error) {
      console.error('Error deleting workspace:', error);
    }
  };

  const handleConnectWorkspace = async (workspaceId: string) => {
    try {
      setConnectingWorkspace(workspaceId);
      await activateWorkspace(workspaceId);
      
      // Fetch all sessions for this workspace and find the most recent one
      try {
        const sessions = await listWorkspaceSessions(workspaceId);
        if (sessions && sessions.length > 0) {
          // Sort by updated_at to find the most recent session
          const sortedSessions = sessions.sort((a: any, b: any) => 
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          const mostRecentSession = sortedSessions[0];
          onWorkspaceConnect(workspaceId, mostRecentSession._id);
        } else {
          onWorkspaceConnect(workspaceId);
        }
      } catch (sessionError) {
        console.warn('Could not fetch sessions, connecting without auto-loading:', sessionError);
        onWorkspaceConnect(workspaceId);
      }
    } catch (error) {
      console.error('Error connecting to workspace:', error);
      alert('Failed to connect to database. Please check your connection settings.');
    } finally {
      setConnectingWorkspace(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to NLP to SQL Assistant
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Connect to your databases and start querying with natural language
          </p>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-16">
            <div className="bg-white p-12 rounded-2xl shadow-xl max-w-2xl mx-auto">
              <Database className="h-16 w-16 text-indigo-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                No Workspaces Found
              </h2>
              <p className="text-gray-600 mb-8 text-lg">
                Create your first workspace to connect to a database and start querying with natural language.
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Workspace
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Your Workspaces</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Workspace
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workspaces.map((workspace) => (
                <div
                  key={workspace._id}
                  className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 overflow-hidden border border-gray-100"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-lg">
                          <Database className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{workspace.name}</h3>
                          <p className="text-sm text-gray-500">{workspace.db_connection.db_name}</p>
                        </div>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setDropdownOpen(dropdownOpen === workspace._id ? null : workspace._id)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {dropdownOpen === workspace._id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                            <button
                              onClick={() => {
                                setEditingWorkspace(workspace);
                                setDropdownOpen(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Workspace
                            </button>
                            <button
                              onClick={() => {
                                setShowSessions(workspace._id);
                                setDropdownOpen(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <History className="h-4 w-4 mr-2" />
                              View Sessions
                            </button>
                            <button
                              onClick={() => {
                                handleDeleteWorkspace(workspace._id);
                                setDropdownOpen(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Workspace
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {workspace.description && (
                      <p className="text-gray-600 text-sm mb-4">{workspace.description}</p>
                    )}

                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>
                          <span className="font-medium">Host:</span> {workspace.db_connection.host}
                        </div>
                        <div>
                          <span className="font-medium">Port:</span> {workspace.db_connection.port}
                        </div>
                        <div>
                          <span className="font-medium">Type:</span> {workspace.db_connection.db_type}
                        </div>
                        <div>
                          <span className="font-medium">Created:</span> {formatDate(workspace.created_at)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleConnectWorkspace(workspace._id)}
                      disabled={connectingWorkspace === workspace._id}
                      className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {connectingWorkspace === workspace._id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting to Database...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Connect & Start Chatting
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Workspace Modal */}
      {(showCreateForm || editingWorkspace) && (
        <WorkspaceForm
          workspace={editingWorkspace}
          onSubmit={editingWorkspace ? 
            (data: WorkspaceRequest) => handleUpdateWorkspace(editingWorkspace._id, data) : 
            handleCreateWorkspace
          }
          onClose={() => {
            setShowCreateForm(false);
            setEditingWorkspace(null);
          }}
        />
      )}

      {/* Sessions Modal */}
      {showSessions && (
        <SessionsList
          workspaceId={showSessions}
          onClose={() => setShowSessions(null)}
          onSessionSelect={(sessionId: string) => {
            // Handle session selection if needed
            console.log('Selected session:', sessionId);
          }}
        />
      )}

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setDropdownOpen(null)}
        />
      )}
    </div>
  );
} 