/*
 * Created by SharpDevelop.
 * User: aluno_iot
 * Date: 01/07/2026
 * Time: 09:23
 * 
 * To change this template use Tools | Options | Coding | Edit Standard Headers.
 */
namespace TelaLogin
{
	partial class TelaCadastro
	{
		/// <summary>
		/// Designer variable used to keep track of non-visual components.
		/// </summary>
		private System.ComponentModel.IContainer components = null;
		private System.Windows.Forms.Button button1;
		private System.Windows.Forms.TextBox txtUsuario;
		private System.Windows.Forms.TextBox txtSenha;
		private System.Windows.Forms.Label label1;
		private System.Windows.Forms.Label label2;
		private System.Windows.Forms.Label label3;
		private System.Windows.Forms.LinkLabel LblCadastrarLinkClicked;
		
		/// <summary>
		/// Disposes resources used by the form.
		/// </summary>
		/// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
		protected override void Dispose(bool disposing)
		{
			if (disposing) {
				if (components != null) {
					components.Dispose();
				}
			}
			base.Dispose(disposing);
		}
		
		/// <summary>
		/// This method is required for Windows Forms designer support.
		/// Do not change the method contents inside the source code editor. The Forms designer might
		/// not be able to load this method if it was changed manually.
		/// </summary>
		private void InitializeComponent()
		{
			this.button1 = new System.Windows.Forms.Button();
			this.txtUsuario = new System.Windows.Forms.TextBox();
			this.txtSenha = new System.Windows.Forms.TextBox();
			this.label1 = new System.Windows.Forms.Label();
			this.label2 = new System.Windows.Forms.Label();
			this.label3 = new System.Windows.Forms.Label();
			this.LblCadastrarLinkClicked = new System.Windows.Forms.LinkLabel();
			this.SuspendLayout();
			// 
			// button1
			// 
			this.button1.Location = new System.Drawing.Point(264, 269);
			this.button1.Name = "button1";
			this.button1.Size = new System.Drawing.Size(75, 23);
			this.button1.TabIndex = 0;
			this.button1.Text = "button1";
			this.button1.UseVisualStyleBackColor = true;
			// 
			// txtUsuario
			// 
			this.txtUsuario.Location = new System.Drawing.Point(163, 88);
			this.txtUsuario.Name = "txtUsuario";
			this.txtUsuario.Size = new System.Drawing.Size(100, 20);
			this.txtUsuario.TabIndex = 1;
			// 
			// txtSenha
			// 
			this.txtSenha.Location = new System.Drawing.Point(163, 118);
			this.txtSenha.Name = "txtSenha";
			this.txtSenha.Size = new System.Drawing.Size(100, 20);
			this.txtSenha.TabIndex = 2;
			// 
			// label1
			// 
			this.label1.Location = new System.Drawing.Point(25, 91);
			this.label1.Name = "label1";
			this.label1.Size = new System.Drawing.Size(100, 23);
			this.label1.TabIndex = 3;
			this.label1.Text = "label1";
			// 
			// label2
			// 
			this.label2.Location = new System.Drawing.Point(25, 121);
			this.label2.Name = "label2";
			this.label2.Size = new System.Drawing.Size(100, 23);
			this.label2.TabIndex = 4;
			this.label2.Text = "label2";
			// 
			// label3
			// 
			this.label3.Location = new System.Drawing.Point(153, 13);
			this.label3.Name = "label3";
			this.label3.Size = new System.Drawing.Size(100, 23);
			this.label3.TabIndex = 5;
			this.label3.Text = "label3";
			// 
			// LblCadastrarLinkClicked
			// 
			this.LblCadastrarLinkClicked.Location = new System.Drawing.Point(153, 202);
			this.LblCadastrarLinkClicked.Name = "LblCadastrarLinkClicked";
			this.LblCadastrarLinkClicked.Size = new System.Drawing.Size(100, 23);
			this.LblCadastrarLinkClicked.TabIndex = 6;
			this.LblCadastrarLinkClicked.TabStop = true;
			this.LblCadastrarLinkClicked.Text = "linkLabel1";
			// 
			// TelaCadastro
			// 
			this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
			this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
			this.ClientSize = new System.Drawing.Size(317, 304);
			this.Controls.Add(this.LblCadastrarLinkClicked);
			this.Controls.Add(this.label3);
			this.Controls.Add(this.label2);
			this.Controls.Add(this.label1);
			this.Controls.Add(this.txtSenha);
			this.Controls.Add(this.txtUsuario);
			this.Controls.Add(this.button1);
			this.Name = "TelaCadastro";
			this.Text = "TelaCadastro";
			this.ResumeLayout(false);
			this.PerformLayout();

		}
	}
}
