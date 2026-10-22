using System;
using System.Windows.Forms;
using MySql.Data.MySqlClient;

namespace TelaLogin
{
    public partial class TelaLogin : Form
    {
        public TelaLogin()
        {
            InitializeComponent();
        }

        void BtnEntrarClick(object sender, EventArgs e)
        {
            if (txtUsuario.Text != "" && txtSenha.Text != "")
            {
                string conexaoBanco =
                "server=localhost;port=3306;database=sistema_clientes;uid=root;pwd='';";

                MySqlConnection conexao = new MySqlConnection(conexaoBanco);

                try
                {
                    conexao.Open();

                    string sql =
                    "SELECT * FROM usuarios WHERE usuario=@usuario AND senha=@senha";

                    MySqlCommand cmd = new MySqlCommand(sql, conexao);

                    cmd.Parameters.AddWithValue("@usuario", txtUsuario.Text);
                    cmd.Parameters.AddWithValue("@senha", txtSenha.Text);

                    MySqlDataReader dr = cmd.ExecuteReader();

                    if (dr.Read())
                    {
                        Sessao.Usuario = dr["usuario"].ToString();
                        Sessao.Tipo = dr["tipo"].ToString();

                        MessageBox.Show("Login realizado com sucesso!");

                        if (Sessao.Tipo == "admin")
                        {
                            CadastroCliente tela = new CadastroCliente();
                            tela.Show();
                        }
                        else
                        {
                            MessageBox.Show("Bem-vindo cliente!");
                        }

                        this.Hide();
                    }
                    else
                    {
                        MessageBox.Show("Usuário ou senha incorretos.");
                    }

                    dr.Close();
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Erro: " + ex.Message);
                }
                finally
                {
                    conexao.Close();
                }
            }
            else
            {
                MessageBox.Show("Preencha todos os campos!");
            }
        }
	
	
		
    }
}