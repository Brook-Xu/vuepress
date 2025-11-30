const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    email: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true
  });
  return User;
};
