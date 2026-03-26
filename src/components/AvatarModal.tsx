import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, ImageIcon, Grid } from 'lucide-react';
import { MONSTER_AVATARS } from '../constants';
import { Avatar } from '../types';

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (avatar: Avatar) => void;
  currentAvatarId?: string;
  customAvatars?: Avatar[];
}

const AvatarButton: React.FC<{
  avatar: Avatar;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ avatar, isSelected, onSelect }) => (
  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={onSelect}
    className={`relative group rounded-2xl overflow-hidden border-4 transition-all ${
      isSelected
        ? 'border-indigo-500 ring-4 ring-indigo-100'
        : 'border-transparent hover:border-gray-200'
    }`}
  >
    <img
      src={avatar.url}
      alt={avatar.name}
      className="w-full aspect-square object-cover"
      referrerPolicy="no-referrer"
    />
    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
      <span className="text-white text-[10px] font-medium px-2 py-1 bg-black/50 rounded-full truncate max-w-[90%]">
        {avatar.name}
      </span>
    </div>
    {isSelected && (
      <div className="absolute top-2 right-2 bg-indigo-500 text-white p-1 rounded-full shadow-lg">
        <Check size={14} />
      </div>
    )}
  </motion.button>
);

export const AvatarModal: React.FC<AvatarModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentAvatarId,
  customAvatars = [],
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none p-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto border border-white/20">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-slate-50">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Escolha um Avatar</h2>
                  <p className="text-sm text-gray-500">Selecione uma imagem da sua biblioteca ou da coleção padrão</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-10">
                  {/* Custom Avatars Section */}
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <ImageIcon size={14} className="text-indigo-500" />
                      Minha Biblioteca
                    </h3>
                    {customAvatars.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {customAvatars.map((avatar) => (
                          <AvatarButton 
                            key={avatar.id} 
                            avatar={avatar} 
                            isSelected={currentAvatarId === avatar.id} 
                            onSelect={() => {
                              onSelect(avatar);
                              onClose();
                            }} 
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center">
                        <p className="text-sm text-slate-500">Sua biblioteca está vazia.</p>
                        <p className="text-xs text-slate-400 mt-1">Adicione imagens na aba "Biblioteca" do painel principal.</p>
                      </div>
                    )}
                  </section>

                  {/* Default Avatars Section */}
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Grid size={14} className="text-indigo-500" />
                      Coleção Padrão
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {MONSTER_AVATARS.map((avatar) => (
                        <AvatarButton 
                          key={avatar.id} 
                          avatar={avatar} 
                          isSelected={currentAvatarId === avatar.id} 
                          onSelect={() => {
                            onSelect(avatar);
                            onClose();
                          }} 
                        />
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                  Gerencie sua biblioteca de imagens no painel de controle
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
