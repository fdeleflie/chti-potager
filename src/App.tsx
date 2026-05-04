/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, auth, googleProvider } from './firebase';
import { collection, onSnapshot, addDoc, doc, setDoc, updateDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { Product, Settings, Category } from './types';
import { Settings as SettingsIcon, Leaf, Plus, Trash2, LogIn, LogOut, Store, Save, Pencil, LayoutGrid, List, X, Info, FolderPlus, Download, Upload, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (errInfo.error.includes('permission-denied') || errInfo.error.includes('Missing or insufficient permissions')) {
    toast.error("Erreur de permission : action refusée.");
    throw new Error(JSON.stringify(errInfo));
  }
}

const initialProductState: Omit<Product, 'id'> = {
  name: '',
  description: '',
  category: '',
  unit: 'kg',
  price: 0,
  isPriceEstimated: false,
  availability: 'En stock',
  origin: 'Serre',
  stock: 0,
  isStockVisible: true,
  imageUrl: '',
  isDiscountActive: false,
  discountPercentage: 0,
  discountType: 'percentage',
  buyX: 3,
  getY: 1
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<'catalog' | 'settings' | 'legal' | 'trash' | 'product_form'>('catalog');
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin state
  const [newProduct, setNewProduct] = useState<Omit<Product, 'id'>>(initialProductState);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newOriginName, setNewOriginName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingSettings, setEditingSettings] = useState<Settings | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Backup/Restore state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestoreData, setPendingRestoreData] = useState<any>(null);
  
  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{type: 'product' | 'category', id: string, name: string} | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Hardcoded admin check for demo purposes (replace with custom claims in production)
      setIsAdmin(u?.email === 'fdeleflie@gmail.com');
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
      toast.error("Impossible de charger les produits.");
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
      toast.error("Impossible de charger les catégories.");
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Settings;
        setSettings(data);
        setEditingSettings(data);
      } else {
        // Default settings if none exist
        const defaultSettings: Settings = { 
          siteName: 'Les Serres du Maraîcher', 
          welcomeMessage: 'Tous nos produits sont cultivés avec amour et dans le respect de l\'environnement.',
          siren: '123456789', 
          siret: '12345678901234',
          contactName: 'Maraîcher', 
          legalName: 'Jean Dupont',
          email: 'contact@ferme.fr',
          address: '1 rue de la Ferme, 75000 Paris', 
          phone: '0123456789', 
          logoUrl: '', 
          pickupSlots: [], 
          openingHours: 'Lundi au Samedi: 9h - 18h',
          rcsCity: 'Paris',
          vatExempt: true,
          insurance: ''
        };
        setSettings(defaultSettings);
        setEditingSettings(defaultSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/config');
      toast.error("Impossible de charger les paramètres.");
    });

    return () => { unsubAuth(); unsubProducts(); unsubCategories(); unsubSettings(); };
  }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), { 
        name: newCategoryName.trim(),
        order: categories.length 
      });
      setNewCategoryName('');
      toast.success("Catégorie ajoutée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
      toast.error("Erreur lors de l'ajout de la catégorie.");
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', id), { name: editingCategoryName.trim() });
      setEditingCategoryId(null);
      setEditingCategoryName('');
      toast.success("Catégorie mise à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
      toast.error("Erreur lors de la mise à jour.");
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const hasProducts = products.some(p => p.category === name);
    if (hasProducts) {
      toast.error("Impossible de supprimer une catégorie utilisée par des produits.");
      return;
    }
    setDeleteConfirmation({ type: 'category', id, name });
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Connexion réussie !");
    } catch (error: any) {
      console.error("Erreur de connexion:", error);
      toast.error("Erreur de connexion : " + (error.message || "Vérifiez la configuration Firebase."));
    }
  };
  const logout = () => signOut(auth);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingSettings) return;
    try {
      await setDoc(doc(db, 'settings', 'config'), editingSettings);
      toast.success("Paramètres mis à jour !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/config');
      toast.error("Erreur lors de la mise à jour des paramètres.");
    }
  };

  const handleAddUnit = async () => {
    const val = newUnitName.trim();
    if (!val) return;
    const currentUnits = editingSettings?.units || ['kg', 'pièce', 'pot', 'sachet'];
    if (currentUnits.includes(val)) {
      toast.error("Cette unité existe déjà.");
      return;
    }
    const updatedSettings = { ...editingSettings!, units: [...currentUnits, val] };
    setEditingSettings(updatedSettings);
    setNewUnitName('');
    try {
      await setDoc(doc(db, 'settings', 'config'), updatedSettings);
      toast.success("Unité ajoutée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/config');
      toast.error("Erreur lors de l'ajout de l'unité.");
    }
  };

  const handleAddOrigin = async () => {
    const val = newOriginName.trim();
    if (!val) return;
    const currentOrigins = editingSettings?.origins || ['Serre', 'Plein champ'];
    if (currentOrigins.includes(val)) {
      toast.error("Cette méthode existe déjà.");
      return;
    }
    const updatedSettings = { ...editingSettings!, origins: [...currentOrigins, val] };
    setEditingSettings(updatedSettings);
    setNewOriginName('');
    try {
      await setDoc(doc(db, 'settings', 'config'), updatedSettings);
      toast.success("Méthode ajoutée !");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/config');
      toast.error("Erreur lors de l'ajout de la méthode.");
    }
  };

  const handleExportData = async () => {
    try {
      const productsSnapshot = await getDocs(collection(db, 'products'));
      const categoriesSnapshot = await getDocs(collection(db, 'categories'));
      const settingsSnapshot = await getDoc(doc(db, 'settings', 'config'));

      const backup = {
        products: productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
        categories: categoriesSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
        settings: settingsSnapshot.exists() ? settingsSnapshot.data() : null,
        timestamp: new Date().toISOString(),
        version: 1
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sauvegarde_maraicher_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Sauvegarde téléchargée avec succès !");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erreur lors de la sauvegarde.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.products || !json.categories) {
          throw new Error("Format de fichier invalide");
        }
        setPendingRestoreData(json);
      } catch (error) {
        toast.error("Fichier de sauvegarde invalide.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingRestoreData) return;
    try {
      let successCount = 0;
      let errorCount = 0;

      // Restore Settings
      if (pendingRestoreData.settings) {
        try {
          await setDoc(doc(db, 'settings', 'config'), pendingRestoreData.settings);
        } catch (e) {
          console.error("Error restoring settings", e);
        }
      }

      // Restore Categories
      for (const cat of pendingRestoreData.categories) {
        try {
          const { id, ...data } = cat;
          await setDoc(doc(db, 'categories', id), data);
        } catch (e) {
          console.error("Error restoring category", id, e);
        }
      }

      // Restore Products
      for (const prod of pendingRestoreData.products) {
        try {
          const { id, ...data } = prod;
          await setDoc(doc(db, 'products', id), data);
          successCount++;
        } catch (e) {
          errorCount++;
          console.error("Error restoring product", id, e);
        }
      }

      if (errorCount > 0) {
        toast.warning(`Restauration partielle : ${successCount} produits restaurés, ${errorCount} erreurs.`);
      } else {
        toast.success("Restauration terminée avec succès !");
      }
      setPendingRestoreData(null);
    } catch (error) {
      console.error("Restore error:", error);
      toast.error("Erreur lors de la restauration.");
    }
  };

  const cancelRestore = () => {
    setPendingRestoreData(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const productToSave = { ...newProduct };
    productToSave.name = productToSave.name.trim();
    
    if (!productToSave.name) {
      toast.error("Le nom du produit est requis.");
      return;
    }

    if (!productToSave.category) {
      if (categories.length > 0) {
        productToSave.category = categories[0].name;
      } else {
        toast.error("Veuillez créer une catégorie avant d'ajouter un produit.");
        return;
      }
    }

    if (isNaN(productToSave.price) || productToSave.price < 0) productToSave.price = 0;
    if (isNaN(productToSave.stock) || productToSave.stock < 0) productToSave.stock = 0;

    // Clear unused promotion data to prevent double promotion
    if (!productToSave.isDiscountActive) {
      productToSave.discountPercentage = 0;
      delete productToSave.buyX;
      delete productToSave.getY;
    } else {
      if (!productToSave.discountType || productToSave.discountType === 'percentage') {
        delete productToSave.buyX;
        delete productToSave.getY;
      } else if (productToSave.discountType === 'buyXgetY') {
        productToSave.discountPercentage = 0;
        if (!productToSave.buyX) productToSave.buyX = 3;
        if (!productToSave.getY) productToSave.getY = 1;
      }
    }

    try {
      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), productToSave);
        toast.success("Produit modifié avec succès !");
        setEditingProductId(null);
      } else {
        await addDoc(collection(db, 'products'), productToSave);
        toast.success("Produit créé avec succès !");
      }
      setNewProduct({ ...initialProductState, category: categories.length > 0 ? categories[0].name : '' });
    } catch (error) {
      handleFirestoreError(error, editingProductId ? OperationType.UPDATE : OperationType.CREATE, editingProductId ? `products/${editingProductId}` : 'products');
      toast.error(editingProductId ? "Erreur lors de la modification du produit." : "Erreur lors de la création du produit.");
    }
  };

  const handleEditProduct = (product: Product) => {
    const { id, ...productData } = product;
    setNewProduct(productData);
    setEditingProductId(id);
    setView('product_form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    setDeleteConfirmation({ type: 'product', id, name });
  };

  const confirmDeletion = async () => {
    if (!deleteConfirmation) return;
    
    const { type, id } = deleteConfirmation;
    
    if (type === 'product') {
      try {
        await updateDoc(doc(db, 'products', id), { isDeleted: true });
        toast.success("Produit déplacé vers la corbeille !");
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
        toast.error("Erreur lors de la suppression.");
      }
    } else if (type === 'category') {
      try {
        await deleteDoc(doc(db, 'categories', id));
        toast.success("Catégorie supprimée !");
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
        toast.error("Erreur lors de la suppression.");
      }
    }
    
    setDeleteConfirmation(null);
  };

  const handleRestoreProduct = async (id: string) => {
    try {
      await updateDoc(doc(db, 'products', id), { isDeleted: false });
      toast.success("Produit restauré !");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
      toast.error("Erreur lors de la restauration.");
    }
  };

  const handlePermanentDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success("Produit supprimé définitivement !");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      toast.error("Erreur lors de la suppression définitive.");
    }
  };

  const addExampleProducts = async () => {
    const exampleCategories = ['Légumes', 'Fruits', 'Produits transformés', 'Paniers', 'Semis & Graines'];
    
    try {
      // Add categories if they don't exist
      for (let i = 0; i < exampleCategories.length; i++) {
        const catName = exampleCategories[i];
        if (!categories.some(c => c.name === catName)) {
          await addDoc(collection(db, 'categories'), { name: catName, order: i });
        }
      }

      const examples: Omit<Product, 'id'>[] = [
        { name: 'Tomate Marmande', category: 'Légumes', unit: 'kg', price: 3.5, isPriceEstimated: true, availability: 'En stock', origin: 'Serre', stock: 50, imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&q=80' },
        { name: 'Confiture de Fraise', category: 'Produits transformés', unit: 'pot', price: 4.5, isPriceEstimated: false, availability: 'En stock', origin: 'Serre', stock: 20, imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80' },
        { name: 'Courgette', category: 'Légumes', unit: 'kg', price: 2.5, isPriceEstimated: true, availability: 'En stock', origin: 'Plein champ', stock: 30, imageUrl: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=500&q=80' },
        { name: 'Graines de Basilic', category: 'Semis & Graines', unit: 'sachet', price: 2.5, isPriceEstimated: false, availability: 'En stock', origin: 'Serre', stock: 100, imageUrl: 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?w=500&q=80' },
        { name: 'Semis de Tomate', category: 'Semis & Graines', unit: 'pièce', price: 1.5, isPriceEstimated: false, availability: 'En stock', origin: 'Serre', stock: 50, imageUrl: 'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=500&q=80' },
      ];
      for (const p of examples) {
        await addDoc(collection(db, 'products'), p);
      }
      toast.success("Produits et catégories d'exemple ajoutés !");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products/categories');
      toast.error("Erreur lors de l'ajout des exemples.");
    }
  };

  const activeProducts = products.filter(p => !p.isDeleted);
  const trashedProducts = products.filter(p => p.isDeleted);

  const filteredProducts = (selectedCategory === 'Tous' 
    ? activeProducts 
    : activeProducts.filter(p => p.category === selectedCategory)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      <Toaster position="top-center" richColors />
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-stone-800 cursor-pointer" onClick={() => setView('catalog')}>
            <Leaf className="text-green-600" /> {settings?.siteName || 'Les Serres du Maraîcher'}
          </h1>
          <div className="flex items-center gap-4 text-sm font-medium">
            <button onClick={() => setView('catalog')} className={`flex items-center gap-1 hover:text-green-600 ${view === 'catalog' ? 'text-green-700' : 'text-stone-600'}`}>
              <Store size={18} /> Catalogue
            </button>
            
            {isAdmin && (
              <>
                <button onClick={() => setView('settings')} className={`flex items-center gap-1 hover:text-green-600 ${view === 'settings' ? 'text-green-700' : 'text-stone-600'}`}>
                  <SettingsIcon size={18} /> Admin
                </button>
                <button onClick={() => setView('trash')} className={`flex items-center gap-1 hover:text-red-600 ${view === 'trash' ? 'text-red-700' : 'text-stone-600'}`}>
                  <Trash2 size={18} /> Corbeille ({trashedProducts.length})
                </button>
              </>
            )}

            {user ? (
              <button onClick={logout} className="flex items-center gap-1 text-stone-500 hover:text-red-600 ml-4">
                <LogOut size={18} /> Déconnexion
              </button>
            ) : (
              <button onClick={login} className="flex items-center gap-1 text-stone-500 hover:text-green-600 ml-4">
                <LogIn size={18} /> Connexion
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 py-8">
        {/* CATALOG VIEW */}
        {view === 'catalog' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-8 text-center max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-stone-800 mb-2">Nos Produits de la Ferme</h2>
              {settings?.welcomeMessage && (
                <p className="text-green-700 font-medium mb-4">{settings.welcomeMessage}</p>
              )}
              <p className="text-stone-600 mb-6">Consultez les disponibilités de nos légumes, fruits et produits transformés.</p>
              
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {['Tous', ...categories.map(c => c.name)].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === cat ? 'bg-green-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex justify-center gap-4 border-t border-stone-100 pt-6">
                {isAdmin && (
                  <button 
                    onClick={() => {
                      setView('product_form');
                      setEditingProductId(null);
                      setNewProduct(initialProductState);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-green-100 text-green-800 hover:bg-green-200"
                  >
                    <Plus size={16} /> Nouveau produit
                  </button>
                )}
                <div className="flex gap-2 ml-auto sm:ml-0">
                  <button 
                    onClick={() => setDisplayMode('grid')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${displayMode === 'grid' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                  >
                    <LayoutGrid size={16} /> Grille
                  </button>
                  <button 
                    onClick={() => setDisplayMode('list')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${displayMode === 'list' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                  >
                    <List size={16} /> Liste
                  </button>
                </div>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 border-dashed">
                <p className="mb-4 text-stone-500">Le catalogue est vide pour le moment.</p>
                {isAdmin && (
                  <button onClick={addExampleProducts} className="flex items-center gap-2 mx-auto bg-green-700 text-white px-6 py-3 rounded-xl hover:bg-green-800 transition-colors">
                    <Plus size={20} /> Ajouter des produits d'exemple
                  </button>
                )}
              </div>
            ) : displayMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map(product => {
                  const hasPercentageDiscount = product.isDiscountActive && (!product.discountType || product.discountType === 'percentage') && product.discountPercentage && product.discountPercentage > 0;
                  const hasBuyXGetYDiscount = product.isDiscountActive && product.discountType === 'buyXgetY';
                  const buyX = product.buyX || 3;
                  const getY = product.getY || 1;
                  const hasDiscount = hasPercentageDiscount || hasBuyXGetYDiscount;
                  const discountedPrice = hasPercentageDiscount ? product.price * (1 - product.discountPercentage! / 100) : product.price;

                  return (
                  <div 
                    key={product.id} 
                    onClick={() => setSelectedProduct(product)}
                    className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col relative cursor-pointer group"
                  >
                    {hasPercentageDiscount && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md z-10 shadow-sm">
                        -{product.discountPercentage}%
                      </div>
                    )}
                    {hasBuyXGetYDiscount && (
                      <div className="absolute top-2 left-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-md z-10 shadow-sm">
                        {buyX} achetés = {getY} gratuit(s)
                      </div>
                    )}
                    {isAdmin && (
                      <div className="absolute top-2 right-2 flex gap-2 z-10" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleEditProduct(product)} className="bg-white/80 p-2 rounded-full text-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteProduct(product.id, product.name); }} className="bg-white/80 p-2 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                    <div className="relative overflow-hidden">
                      {product.imageUrl ? (
                        product.imageUrl.startsWith('http') ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-48 bg-stone-100 flex items-center justify-center text-6xl group-hover:scale-105 transition-transform duration-500">
                            {product.imageUrl}
                          </div>
                        )
                      ) : (
                        <div className="w-full h-48 bg-stone-100 flex items-center justify-center text-stone-400 group-hover:scale-105 transition-transform duration-500">
                          <Leaf size={48} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="bg-white text-stone-800 px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
                          <Info size={16} /> Voir détails
                        </span>
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold text-stone-800">{product.name}</h3>
                        <span className="bg-stone-100 text-stone-600 text-xs px-2 py-1 rounded-md font-medium">{product.category}</span>
                      </div>
                      {product.description && (
                        <p className="text-sm text-stone-600 mb-3 italic line-clamp-2">{product.description}</p>
                      )}
                      <p className="text-sm text-stone-500 mb-4 flex-1">
                        Cultivé en {product.origin.toLowerCase()}
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <div>
                          {hasPercentageDiscount ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p className="text-xl font-bold text-red-600">{discountedPrice.toFixed(2)}€</p>
                                <span className="text-sm text-stone-400 line-through">{product.price.toFixed(2)}€</span>
                              </div>
                              <span className="text-sm text-stone-500 font-normal">/ {product.unit}</span>
                            </div>
                          ) : hasBuyXGetYDiscount ? (
                            <div className="flex flex-col">
                              <p className="text-xl font-bold text-purple-600">{product.price.toFixed(2)}€</p>
                              <span className="text-sm text-stone-500 font-normal">/ {product.unit}</span>
                            </div>
                          ) : (
                            <p className="text-xl font-bold text-stone-800">
                              {product.price.toFixed(2)}€ <span className="text-sm text-stone-500 font-normal">/ {product.unit}</span>
                            </p>
                          )}
                          {product.isPriceEstimated && (
                            <p className="text-[10px] text-stone-400 italic">Prix indicatif</p>
                          )}
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${product.availability === 'En stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {product.availability}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map(product => {
                  const hasPercentageDiscount = product.isDiscountActive && (!product.discountType || product.discountType === 'percentage') && product.discountPercentage && product.discountPercentage > 0;
                  const hasBuyXGetYDiscount = product.isDiscountActive && product.discountType === 'buyXgetY';
                  const buyX = product.buyX || 3;
                  const getY = product.getY || 1;
                  const hasDiscount = hasPercentageDiscount || hasBuyXGetYDiscount;
                  const discountedPrice = hasPercentageDiscount ? product.price * (1 - product.discountPercentage! / 100) : product.price;

                  return (
                    <div 
                      key={product.id} 
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white rounded-xl shadow-sm border border-stone-100 p-3 hover:shadow-md transition-all flex items-center gap-4 cursor-pointer group"
                    >
                      <div className="w-16 h-16 rounded-lg bg-stone-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {product.imageUrl ? (
                          product.imageUrl.startsWith('http') ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl">{product.imageUrl}</span>
                          )
                        ) : (
                          <Leaf size={24} className="text-stone-300" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-stone-800 truncate">{product.name}</h3>
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded uppercase tracking-wider">{product.category}</span>
                          {hasPercentageDiscount && (
                            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded">-{product.discountPercentage}%</span>
                          )}
                          {hasBuyXGetYDiscount && (
                            <span className="bg-purple-100 text-purple-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{buyX} achetés = {getY} gratuit(s)</span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 truncate">
                          {product.description || `Cultivé en ${product.origin.toLowerCase()}`}
                        </p>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          {hasPercentageDiscount && (
                            <span className="text-xs text-stone-400 line-through">{product.price.toFixed(2)}€</span>
                          )}
                          <p className={`font-bold ${hasPercentageDiscount ? 'text-red-600' : hasBuyXGetYDiscount ? 'text-purple-600' : 'text-stone-800'}`}>
                            {discountedPrice.toFixed(2)}€
                          </p>
                        </div>
                        <span className="text-[10px] text-stone-400">par {product.unit}</span>
                      </div>

                      <div className="hidden sm:block">
                        <div className={`px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${product.availability === 'En stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {product.availability}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleEditProduct(product)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteProduct(product.id, product.name); }} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* PRODUCT FORM VIEW */}
        {view === 'product_form' && isAdmin && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
                {editingProductId ? <Pencil className="text-green-600" /> : <Plus className="text-green-600" />}
                {editingProductId ? "Modifier le produit" : "Créer un nouveau produit"}
              </h2>
              <button onClick={() => setView('catalog')} className="text-stone-500 hover:text-stone-800 flex items-center gap-1">
                <X size={20} /> Fermer
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8 mb-6">
              <form onSubmit={(e) => {
                handleCreateProduct(e);
                setView('catalog');
              }} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Nom du produit</label>
                    <input type="text" required value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="ex: Tomate Marmande" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Catégorie</label>
                    <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value as any})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                      {categories.length === 0 && (
                        <option value="">Aucune catégorie disponible</option>
                      )}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Commentaire / Description (optionnel)</label>
                    <textarea value={newProduct.description || ''} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="ex: Produit bio, cultivé sans pesticides..." rows={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Prix (€)</label>
                    <input type="number" step="0.01" required value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Unité de vente</label>
                    <select value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
                      {(settings?.units || ['kg', 'pièce', 'pot', 'sachet']).map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Stock disponible</label>
                    <input type="number" required value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value, 10) || 0})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
                    <div className="flex items-center gap-2 mt-2">
                      <input 
                        type="checkbox" 
                        id="isStockVisible" 
                        checked={newProduct.isStockVisible ?? true} 
                        onChange={e => setNewProduct({...newProduct, isStockVisible: e.target.checked})} 
                        className="w-4 h-4 text-green-600 rounded border-stone-300 focus:ring-green-500"
                      />
                      <label htmlFor="isStockVisible" className="text-xs font-medium text-stone-600">
                        Afficher la quantité en stock sur la fiche
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Disponibilité</label>
                    <select value={newProduct.availability} onChange={e => setNewProduct({...newProduct, availability: e.target.value as any})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
                      <option value="En stock">En stock</option>
                      <option value="Bientôt disponible">Bientôt disponible</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Méthode de culture</label>
                    <select value={newProduct.origin} onChange={e => setNewProduct({...newProduct, origin: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none">
                      {(settings?.origins || ['Serre', 'Plein champ']).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Image (URL ou Emoji)</label>
                    <input type="text" value={newProduct.imageUrl || ''} onChange={e => setNewProduct({...newProduct, imageUrl: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="https://... ou 🍅" />
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2 mt-2">
                    <input 
                      type="checkbox" 
                      id="isPriceEstimated" 
                      checked={newProduct.isPriceEstimated} 
                      onChange={e => setNewProduct({...newProduct, isPriceEstimated: e.target.checked})} 
                      className="w-4 h-4 text-green-600 rounded border-stone-300 focus:ring-green-500"
                    />
                    <label htmlFor="isPriceEstimated" className="text-sm font-medium text-stone-700">
                      Prix indicatif (ex: vente au poids exact lors du retrait)
                    </label>
                  </div>
                  
                  <div className="sm:col-span-2 flex flex-col gap-4 mt-2 p-4 bg-stone-50 rounded-lg border border-stone-200">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="isDiscountActive" 
                        checked={newProduct.isDiscountActive || false} 
                        onChange={e => setNewProduct({...newProduct, isDiscountActive: e.target.checked})} 
                        className="w-4 h-4 text-green-600 rounded border-stone-300 focus:ring-green-500"
                      />
                      <label htmlFor="isDiscountActive" className="text-sm font-medium text-stone-700">
                        Activer une promotion
                      </label>
                    </div>
                    {newProduct.isDiscountActive && (
                      <div className="flex flex-col sm:flex-row gap-4 pl-6">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                name="discountType"
                                value="percentage"
                                checked={!newProduct.discountType || newProduct.discountType === 'percentage'}
                                onChange={() => setNewProduct({...newProduct, discountType: 'percentage'})}
                                className="w-4 h-4 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm text-stone-700">Pourcentage de réduction</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                name="discountType"
                                value="buyXgetY"
                                checked={newProduct.discountType === 'buyXgetY'}
                                onChange={() => setNewProduct({...newProduct, discountType: 'buyXgetY'})}
                                className="w-4 h-4 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm text-stone-700">X achetés = Y gratuit(s)</span>
                            </label>
                          </div>
                        </div>
                        
                        {(!newProduct.discountType || newProduct.discountType === 'percentage') ? (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-stone-600">Réduction (%) :</label>
                            <input 
                              type="number" 
                              min="1" max="99"
                              value={newProduct.discountPercentage || ''} 
                              onChange={e => setNewProduct({...newProduct, discountPercentage: parseInt(e.target.value) || 0})} 
                              className="w-20 p-1 border border-stone-300 rounded focus:ring-2 focus:ring-green-500 outline-none" 
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="1" max="99"
                              value={newProduct.buyX || 3} 
                              onChange={e => setNewProduct({...newProduct, buyX: parseInt(e.target.value) || 3})} 
                              className="w-16 p-1 border border-stone-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-center" 
                            />
                            <span className="text-sm text-stone-600">achetés =</span>
                            <input 
                              type="number" 
                              min="1" max="99"
                              value={newProduct.getY || 1} 
                              onChange={e => setNewProduct({...newProduct, getY: parseInt(e.target.value) || 1})} 
                              className="w-16 p-1 border border-stone-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-center" 
                            />
                            <span className="text-sm text-stone-600">gratuit(s)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-4 flex flex-col sm:flex-row gap-4">
                  <button type="submit" className="w-full sm:w-auto bg-green-700 text-white px-6 py-3 rounded-xl hover:bg-green-800 font-medium flex items-center justify-center gap-2 transition-colors">
                    {editingProductId ? <Save size={18} /> : <Plus size={18} />} 
                    {editingProductId ? "Enregistrer les modifications" : "Créer le produit"}
                  </button>
                  {editingProductId ? (
                    <button type="button" onClick={() => { setEditingProductId(null); setNewProduct(initialProductState); setView('catalog'); }} className="w-full sm:w-auto bg-stone-200 text-stone-800 px-6 py-3 rounded-xl hover:bg-stone-300 font-medium flex items-center justify-center gap-2 transition-colors">
                      Annuler
                    </button>
                  ) : (
                    <button type="button" onClick={addExampleProducts} className="w-full sm:w-auto bg-stone-200 text-stone-800 px-6 py-3 rounded-xl hover:bg-stone-300 font-medium flex items-center justify-center gap-2 transition-colors">
                      Ajouter des exemples
                    </button>
                  )}
                </div>
              </form>
            </div>
          </motion.div>
        )}

        {/* SETTINGS / ADMIN VIEW */}
        {view === 'settings' && isAdmin && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-stone-800 mb-6 flex items-center gap-2">
              <SettingsIcon /> Administration & Configuration
            </h2>

            {/* CATEGORY MANAGEMENT */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8 mb-6">
              <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2">
                <FolderPlus size={20} className="text-green-600" /> Gestion des Catégories
              </h3>
              
              <form onSubmit={handleCreateCategory} className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  value={newCategoryName} 
                  onChange={e => setNewCategoryName(e.target.value)} 
                  placeholder="Nouvelle catégorie (ex: Fleurs)" 
                  className="flex-1 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                />
                <button type="submit" className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2">
                  <Plus size={18} /> Ajouter
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100 group">
                    {editingCategoryId === cat.id ? (
                      <div className="flex gap-1 w-full">
                        <input 
                          type="text" 
                          value={editingCategoryName} 
                          onChange={e => setEditingCategoryName(e.target.value)} 
                          className="flex-1 p-1 text-sm border border-stone-300 rounded outline-none"
                          autoFocus
                        />
                        <button onClick={() => handleUpdateCategory(cat.id)} className="text-green-600 p-1 hover:bg-green-50 rounded"><Save size={16} /></button>
                        <button onClick={() => setEditingCategoryId(null)} className="text-stone-400 p-1 hover:bg-stone-100 rounded"><X size={16} /></button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-stone-700">{cat.name}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }} 
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }} 
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {categories.length === 0 && (
                <p className="text-center text-stone-400 py-4 italic">Aucune catégorie créée. Commencez par en ajouter une.</p>
              )}
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8">
              <h3 className="text-lg font-bold mb-4 border-b pb-2">Paramètres de la Ferme & Informations Légales</h3>
              <form onSubmit={handleSaveSettings}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2">
                    <h4 className="font-semibold text-stone-800 border-b pb-1 mb-2">Affichage du site</h4>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Nom du site (En-tête)</label>
                    <input type="text" value={editingSettings?.siteName || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, siteName: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="Les Serres du Maraîcher" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Message d'accueil (Page principale)</label>
                    <textarea value={editingSettings?.welcomeMessage || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, welcomeMessage: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows={2} placeholder="ex: Tous nos produits sont cultivés avec amour et dans le respect de l'environnement." />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Horaires d'ouverture</label>
                    <textarea value={editingSettings?.openingHours || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, openingHours: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows={3} placeholder="Lundi: Fermé&#10;Mardi - Samedi: 9h - 18h" />
                  </div>

                  <div className="sm:col-span-2 mt-4">
                    <h4 className="font-semibold text-stone-800 border-b pb-1 mb-2">Paramètres du catalogue</h4>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-2">Unités de vente</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(editingSettings?.units || ['kg', 'pièce', 'pot', 'sachet']).map(unit => (
                        <div key={unit} className="flex items-center gap-1 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full text-sm">
                          <span>{unit}</span>
                          <button 
                            type="button"
                            onClick={async () => {
                              const currentUnits = editingSettings?.units || ['kg', 'pièce', 'pot', 'sachet'];
                              const updatedSettings = { ...editingSettings!, units: currentUnits.filter(u => u !== unit) };
                              setEditingSettings(updatedSettings);
                              try {
                                await setDoc(doc(db, 'settings', 'config'), updatedSettings);
                              } catch (error) {
                                handleFirestoreError(error, OperationType.WRITE, 'settings/config');
                              }
                            }}
                            className="text-stone-400 hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newUnitName} 
                        onChange={e => setNewUnitName(e.target.value)} 
                        className="flex-1 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                        placeholder="Nouvelle unité (ex: botte)" 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddUnit();
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={handleAddUnit}
                        className="bg-stone-200 text-stone-700 px-4 py-2 rounded-lg hover:bg-stone-300 transition-colors flex items-center gap-2"
                      >
                        <Plus size={18} /> Ajouter
                      </button>
                    </div>
                  </div>
                  <div className="sm:col-span-2 mt-2">
                    <label className="block text-sm font-medium text-stone-700 mb-2">Méthodes de culture / Origines</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(editingSettings?.origins || ['Serre', 'Plein champ']).map(origin => (
                        <div key={origin} className="flex items-center gap-1 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full text-sm">
                          <span>{origin}</span>
                          <button 
                            type="button"
                            onClick={async () => {
                              const currentOrigins = editingSettings?.origins || ['Serre', 'Plein champ'];
                              const updatedSettings = { ...editingSettings!, origins: currentOrigins.filter(o => o !== origin) };
                              setEditingSettings(updatedSettings);
                              try {
                                await setDoc(doc(db, 'settings', 'config'), updatedSettings);
                              } catch (error) {
                                handleFirestoreError(error, OperationType.WRITE, 'settings/config');
                              }
                            }}
                            className="text-stone-400 hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newOriginName} 
                        onChange={e => setNewOriginName(e.target.value)} 
                        className="flex-1 p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                        placeholder="Nouvelle méthode (ex: Hydroponie)" 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddOrigin();
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={handleAddOrigin}
                        className="bg-stone-200 text-stone-700 px-4 py-2 rounded-lg hover:bg-stone-300 transition-colors flex items-center gap-2"
                      >
                        <Plus size={18} /> Ajouter
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2 mt-4">
                    <h4 className="font-semibold text-stone-800 border-b pb-1 mb-2">Identité de l'entreprise (Mentions Légales)</h4>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Nom commercial (Contact)</label>
                    <input type="text" value={editingSettings?.contactName || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, contactName: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="ex: Le Potager de Jean" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Nom et Prénom (Identité juridique)</label>
                    <input type="text" value={editingSettings?.legalName || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, legalName: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="ex: Jean Dupont" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Adresse du siège social / exploitation</label>
                    <input type="text" value={editingSettings?.address || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, address: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="1 rue de la Ferme, 75000 Paris" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Numéro de téléphone</label>
                    <input type="tel" value={editingSettings?.phone || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, phone: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="06 12 34 56 78" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Email de contact</label>
                    <input type="email" value={editingSettings?.email || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, email: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="contact@ferme.fr" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Numéro SIRET (14 chiffres)</label>
                    <input type="text" value={editingSettings?.siret || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, siret: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="12345678901234" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Ville d'immatriculation (RCS ou RM)</label>
                    <input type="text" value={editingSettings?.rcsCity || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, rcsCity: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="ex: Paris" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Assurance Responsabilité Civile Professionnelle (RC Pro)</label>
                    <textarea value={editingSettings?.insurance || ''} onChange={e => setEditingSettings(prev => prev ? {...prev, insurance: e.target.value} : null)} className="w-full p-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" rows={2} placeholder="Ex: Assuré chez MMA Pro, contrat n°12345, couverture France métropolitaine." />
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="vatExempt" 
                      checked={editingSettings?.vatExempt ?? true} 
                      onChange={e => setEditingSettings(prev => prev ? {...prev, vatExempt: e.target.checked} : null)} 
                      className="w-4 h-4 text-green-600 rounded border-stone-300 focus:ring-green-500"
                    />
                    <label htmlFor="vatExempt" className="text-sm font-medium text-stone-700">
                      Micro-entreprise : Afficher la mention "TVA non applicable, article 293 B du CGI"
                    </label>
                  </div>
                </div>
                <div className="pt-6">
                  <button type="submit" className="bg-stone-800 text-white px-6 py-2 rounded-lg hover:bg-stone-900 font-medium flex items-center gap-2 transition-colors">
                    <Save size={18} /> Enregistrer les paramètres
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8 mb-6">
              <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2">
                <FolderPlus size={20} className="text-stone-500" /> Sauvegarde et Restauration
              </h3>
              <div className="space-y-4">
                <p className="text-sm text-stone-600">
                  Exportez l'intégralité de vos données (produits, catégories, paramètres) pour les sauvegarder, ou importez un fichier de sauvegarde pour restaurer votre catalogue.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={handleExportData}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 hover:bg-stone-200 rounded-lg font-medium transition-colors"
                  >
                    <Download size={18} /> Exporter les données
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".json" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden" 
                      id="restore-upload"
                    />
                    <label 
                      htmlFor="restore-upload"
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 text-white hover:bg-stone-900 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      <Upload size={18} /> Importer une sauvegarde
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TRASH VIEW */}
        {view === 'trash' && isAdmin && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-stone-800 mb-6 flex items-center gap-2">
              <Trash2 className="text-red-600" /> Corbeille
            </h2>
            
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8">
              {trashedProducts.length === 0 ? (
                <p className="text-center text-stone-500 py-8">La corbeille est vide.</p>
              ) : (
                <div className="space-y-4">
                  {trashedProducts.map(product => (
                    <div key={product.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-100 gap-4">
                      <div className="flex items-center gap-4">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-16 h-16 object-cover rounded-lg" />
                        ) : (
                          <div className="w-16 h-16 bg-stone-200 rounded-lg flex items-center justify-center text-2xl">
                            {product.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-stone-800">{product.name}</h3>
                          <p className="text-sm text-stone-500">{product.category} • {product.price.toFixed(2)}€ / {product.unit}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRestoreProduct(product.id); }} 
                          className="flex-1 sm:flex-none px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg font-medium transition-colors"
                        >
                          Restaurer
                        </button>
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePermanentDeleteProduct(product.id); }} 
                          className="flex-1 sm:flex-none px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* LEGAL VIEW */}
      {view === 'legal' && (
        <main className="max-w-4xl mx-auto p-4 py-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
            <h2 className="text-2xl font-bold text-stone-800 mb-8 border-b pb-4">Mentions Légales</h2>
            
            <section className="mb-8">
              <h3 className="text-lg font-bold text-stone-800 mb-3">1. Éditeur du site</h3>
              <div className="space-y-2 text-stone-600">
                <p><strong className="text-stone-800">Nom commercial :</strong> {settings?.contactName}</p>
                <p><strong className="text-stone-800">Nom et Prénom (Identité juridique) :</strong> {settings?.legalName || settings?.contactName}</p>
                <p><strong className="text-stone-800">Adresse du siège social :</strong> {settings?.address}</p>
                <p><strong className="text-stone-800">Email :</strong> {settings?.email}</p>
                <p><strong className="text-stone-800">Téléphone :</strong> {settings?.phone}</p>
                <p><strong className="text-stone-800">Numéro SIRET :</strong> {settings?.siret || settings?.siren}</p>
                {settings?.rcsCity && <p><strong className="text-stone-800">Immatriculation :</strong> Immatriculé au Registre du Commerce et des Sociétés (ou RM) de {settings.rcsCity}</p>}
              </div>
            </section>

            {settings?.vatExempt && (
              <section className="mb-8">
                <h3 className="text-lg font-bold text-stone-800 mb-3">2. TVA</h3>
                <p className="text-stone-600">TVA non applicable, article 293 B du Code général des impôts.</p>
              </section>
            )}

            {settings?.insurance && (
              <section className="mb-8">
                <h3 className="text-lg font-bold text-stone-800 mb-3">3. Assurance Responsabilité Civile Professionnelle</h3>
                <p className="text-stone-600 whitespace-pre-line">{settings.insurance}</p>
              </section>
            )}

            <section className="mb-8">
              <h3 className="text-lg font-bold text-stone-800 mb-3">4. Hébergement</h3>
              <div className="space-y-2 text-stone-600">
                <p>Ce site est hébergé par :</p>
                <p><strong className="text-stone-800">GitHub Inc.</strong></p>
                <p>88 Colin P Kelly Jr St, San Francisco, CA 94107, États-Unis</p>
                <p>Téléphone : +1 (877) 448-4820</p>
              </div>
            </section>
          </motion.div>
        </main>
      )}

      {/* FOOTER */}
      <footer className="bg-stone-900 text-stone-400 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <p className="font-medium text-stone-300 mb-2">{settings?.contactName || 'Les Serres du Maraîcher'}</p>
          <p>{settings?.address}</p>
          {settings?.phone && <p className="mt-1">Tél: {settings.phone}</p>}
          {settings?.openingHours && (
            <div className="mt-2 text-stone-300 whitespace-pre-line">
              <p className="font-medium mb-1">Horaires d'ouverture :</p>
              {settings.openingHours}
            </div>
          )}
          <div className="mt-6 pt-6 border-t border-stone-800 flex flex-col items-center gap-2">
            <button onClick={() => setView('legal')} className="hover:text-stone-200 transition-colors underline underline-offset-4">
              Mentions Légales
            </button>
            <p className="opacity-50">© {new Date().getFullYear()} - Vente directe à la ferme</p>
          </div>
        </div>
      </footer>

      {/* PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl overflow-hidden max-w-2xl w-full shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 z-10 bg-white/80 p-2 rounded-full text-stone-800 hover:bg-white transition-colors shadow-md"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/2 h-64 md:h-auto bg-stone-100 flex items-center justify-center overflow-hidden">
                {selectedProduct.imageUrl ? (
                  selectedProduct.imageUrl.startsWith('http') ? (
                    <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-8xl">{selectedProduct.imageUrl}</span>
                  )
                ) : (
                  <Leaf size={80} className="text-stone-300" />
                )}
              </div>

              <div className="md:w-1/2 p-8 flex flex-col">
                <div className="mb-6">
                  <span className="inline-block bg-stone-100 text-stone-600 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider mb-2">
                    {selectedProduct.category}
                  </span>
                  <h2 className="text-3xl font-bold text-stone-800 mb-2">{selectedProduct.name}</h2>
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${selectedProduct.availability === 'En stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {selectedProduct.availability}
                    </div>
                    <span className="text-sm text-stone-500">Cultivé en {selectedProduct.origin.toLowerCase()}</span>
                  </div>
                </div>

                <div className="flex-1">
                  <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-2">Description</h4>
                  <p className="text-stone-600 leading-relaxed mb-6">
                    {selectedProduct.description || "Aucune description détaillée disponible pour ce produit."}
                  </p>
                  
                  {selectedProduct.traceability && (
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-2">Traçabilité</h4>
                      <p className="text-stone-600 text-sm">{selectedProduct.traceability}</p>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-stone-100">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-stone-400 mb-1">Prix au {selectedProduct.unit}</p>
                      {selectedProduct.isDiscountActive && (!selectedProduct.discountType || selectedProduct.discountType === 'percentage') && selectedProduct.discountPercentage ? (
                        <div className="flex items-center gap-3">
                          <p className="text-3xl font-bold text-red-600">
                            {(selectedProduct.price * (1 - selectedProduct.discountPercentage / 100)).toFixed(2)}€
                          </p>
                          <span className="text-lg text-stone-300 line-through">{selectedProduct.price.toFixed(2)}€</span>
                        </div>
                      ) : selectedProduct.isDiscountActive && selectedProduct.discountType === 'buyXgetY' ? (
                        <div>
                          <p className="text-3xl font-bold text-purple-600">{selectedProduct.price.toFixed(2)}€</p>
                          <span className="inline-block mt-1 bg-purple-100 text-purple-600 text-xs font-bold px-2 py-1 rounded">
                            Promotion : {selectedProduct.buyX || 3} achetés = {selectedProduct.getY || 1} gratuit(s)
                          </span>
                        </div>
                      ) : (
                        <p className="text-3xl font-bold text-stone-800">{selectedProduct.price.toFixed(2)}€</p>
                      )}
                      {selectedProduct.isPriceEstimated && (
                        <p className="text-xs text-stone-400 italic mt-1">Prix indicatif (pesée finale lors du retrait)</p>
                      )}
                    </div>
                    
                    {selectedProduct.isStockVisible !== false && (
                      <div className="text-right">
                        <p className="text-xs text-stone-400 mb-1">Stock</p>
                        <p className="text-lg font-bold text-stone-800">{selectedProduct.stock} {selectedProduct.unit}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteConfirmation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 text-red-600 mb-4">
                  <AlertTriangle size={24} />
                  <h3 className="text-xl font-bold">Confirmer la suppression</h3>
                </div>
                <p className="text-stone-600 mb-6">
                  Êtes-vous sûr de vouloir supprimer {deleteConfirmation.type === 'product' ? 'le produit' : 'la catégorie'} <strong>"{deleteConfirmation.name}"</strong> ?
                  {deleteConfirmation.type === 'product' && " Il sera déplacé vers la corbeille."}
                  {deleteConfirmation.type === 'category' && " Cette action est définitive."}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirmation(null)}
                    className="flex-1 px-4 py-2 bg-stone-100 text-stone-700 hover:bg-stone-200 rounded-lg font-medium transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={confirmDeletion}
                    className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RESTORE CONFIRMATION MODAL */}
      <AnimatePresence>
        {pendingRestoreData && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 text-orange-600 mb-4">
                  <AlertTriangle size={24} />
                  <h3 className="text-xl font-bold">Confirmer la restauration</h3>
                </div>
                <p className="text-stone-600 mb-4">
                  Vous êtes sur le point de restaurer une sauvegarde contenant :
                </p>
                <ul className="list-disc list-inside text-stone-700 mb-6 space-y-1 font-medium">
                  <li>{pendingRestoreData.products?.length || 0} produits</li>
                  <li>{pendingRestoreData.categories?.length || 0} catégories</li>
                  <li>{pendingRestoreData.settings ? 'Paramètres inclus' : 'Aucun paramètre'}</li>
                </ul>
                <p className="text-sm text-stone-500 mb-6 bg-orange-50 p-3 rounded-lg border border-orange-100">
                  Attention : Cette action écrasera les données existantes portant le même identifiant. Les données actuelles non présentes dans la sauvegarde ne seront pas supprimées.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={cancelRestore}
                    className="flex-1 px-4 py-2 bg-stone-100 text-stone-700 hover:bg-stone-200 rounded-lg font-medium transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={confirmRestore}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg font-medium transition-colors"
                  >
                    Restaurer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
